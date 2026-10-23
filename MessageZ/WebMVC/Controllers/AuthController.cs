using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using WebMVC.DTOs.Auth;
using WebMVC.Services;

namespace WebMVC.Controllers;

public class AuthController : Controller
{
    private readonly IAuthApiClient _authApiClient;

    public AuthController(IAuthApiClient authApiClient)
    {
        _authApiClient = authApiClient;
    }

    [HttpGet]
    public IActionResult Login(string? returnUrl = null)
    {
        ViewData["ReturnUrl"] = returnUrl;
        return View();
    }

    [HttpPost]
    public async Task<IActionResult> Login(LoginRequest model, string? returnUrl = null)
    {
        ViewData["ReturnUrl"] = returnUrl;

        if (!ModelState.IsValid)
        {
            TempData["ErrorMessage"] = "Please enter valid email and password.";
            return View(model);
        }

        var result = await _authApiClient.LoginAsync(model);

        if (!result.Success || result.Data == null)
        {
            var errorMsg = result.ErrorMessage ?? "Invalid email or password.";
            TempData["ErrorMessage"] = errorMsg;
            ModelState.AddModelError(string.Empty, errorMsg);
            return View(model);
        }

        var response = result.Data;

        var role = response.User.Role ?? "User";
        var claims = new List<Claim>
        {
            new Claim(ClaimTypes.NameIdentifier, response.User.Id.ToString()),
            new Claim(ClaimTypes.Name, response.User.Username),
            new Claim(ClaimTypes.Email, model.Email),
            new Claim(ClaimTypes.Role, role),
            new Claim("Role", role),
            new Claim("Token", response.Token)
        };

        if (!string.IsNullOrEmpty(response.User.DisplayName))
        {
            claims.Add(new Claim("DisplayName", response.User.DisplayName));
        }

        if (!string.IsNullOrEmpty(response.User.AvatarUrl))
        {
            claims.Add(new Claim("AvatarUrl", response.User.AvatarUrl));
        }

        var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        var authProperties = new AuthenticationProperties
        {
            IsPersistent = true,
            ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
        };

        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme, 
            new ClaimsPrincipal(claimsIdentity), 
            authProperties);

        TempData["SuccessMessage"] = $"Authentication successful! Welcome back, {response.User.Username}.";

        if (string.Equals(role, "Admin", StringComparison.OrdinalIgnoreCase))
        {
            return RedirectToAction("Dashboard", "Admin");
        }

        if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
            return LocalRedirect(returnUrl);

        return RedirectToAction("Index", "Home");
    }

    [HttpGet]
    public IActionResult Register()
    {
        return View();
    }

    [HttpPost]
    public async Task<IActionResult> Register(RegisterRequest model)
    {
        if (!ModelState.IsValid)
        {
            TempData["ErrorMessage"] = "Please correct the highlighted errors.";
            return View(model);
        }

        var result = await _authApiClient.RegisterAsync(model);

        if (!result.Success)
        {
            bool hasFieldErrors = false;

            if (result.ValidationErrors != null && result.ValidationErrors.Count > 0)
            {
                foreach (var (key, errors) in result.ValidationErrors)
                {
                    foreach (var err in errors)
                    {
                        ModelState.AddModelError(key, err);
                        hasFieldErrors = true;
                    }
                }
            }
            else if (!string.IsNullOrEmpty(result.Field))
            {
                ModelState.AddModelError(result.Field, result.Message ?? "Invalid value.");
                hasFieldErrors = true;
            }
            else if (!string.IsNullOrEmpty(result.Message))
            {
                if (result.Message.Contains("Email", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("Email", result.Message);
                    hasFieldErrors = true;
                }
                else if (result.Message.Contains("Username", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("Username", result.Message);
                    hasFieldErrors = true;
                }
                else if (result.Message.Contains("Password", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("Password", result.Message);
                    hasFieldErrors = true;
                }
                else
                {
                    ModelState.AddModelError(string.Empty, result.Message);
                }
            }
            else
            {
                ModelState.AddModelError(string.Empty, "Registration failed. Please try again.");
            }

            TempData["ErrorMessage"] = result.Message ?? (hasFieldErrors ? "Please correct the highlighted errors." : "Registration failed.");
            return View(model);
        }

        TempData["SuccessMessage"] = "Account registered successfully! Please sign in.";
        return RedirectToAction("Login");
    }

    [HttpPost]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        TempData["SuccessMessage"] = "Disconnected safely.";
        return RedirectToAction("Index", "Home");
    }

    [HttpGet]
    public IActionResult ForgotPassword()
    {
        return View();
    }

    [HttpPost]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest model)
    {
        if (!ModelState.IsValid)
        {
            TempData["ErrorMessage"] = "Please enter a valid email address.";
            return View(model);
        }

        var result = await _authApiClient.ForgotPasswordAsync(model.Email);
        if (!result.Success)
        {
            if (!string.IsNullOrEmpty(result.Field))
            {
                ModelState.AddModelError(result.Field, result.Message ?? "Invalid value.");
            }
            else
            {
                ModelState.AddModelError(string.Empty, result.Message ?? "Failed to send OTP code.");
            }

            TempData["ErrorMessage"] = result.Message ?? "Failed to send OTP code. Please check your email.";
            return View(model);
        }

        TempData["SuccessMessage"] = "A 6-digit OTP code has been sent to your email.";
        return RedirectToAction("ResetPassword", new { email = model.Email });
    }

    [HttpGet]
    public IActionResult ResetPassword(string? email = null)
    {
        var model = new ResetPasswordRequest
        {
            Email = email ?? string.Empty
        };
        return View(model);
    }

    [HttpPost]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest model)
    {
        if (!ModelState.IsValid)
        {
            TempData["ErrorMessage"] = "Please correct the highlighted errors.";
            return View(model);
        }

        var result = await _authApiClient.ResetPasswordAsync(model.Email, model.Otp, model.NewPassword);
        if (!result.Success)
        {
            bool hasFieldErrors = false;

            if (result.ValidationErrors != null && result.ValidationErrors.Count > 0)
            {
                foreach (var (key, errors) in result.ValidationErrors)
                {
                    foreach (var err in errors)
                    {
                        ModelState.AddModelError(key, err);
                        hasFieldErrors = true;
                    }
                }
            }
            else if (!string.IsNullOrEmpty(result.Field))
            {
                ModelState.AddModelError(result.Field, result.Message ?? "Invalid value.");
                hasFieldErrors = true;
            }
            else if (!string.IsNullOrEmpty(result.Message))
            {
                if (result.Message.Contains("OTP", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("Otp", result.Message);
                    hasFieldErrors = true;
                }
                else if (result.Message.Contains("Password", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("NewPassword", result.Message);
                    hasFieldErrors = true;
                }
                else if (result.Message.Contains("Email", StringComparison.OrdinalIgnoreCase))
                {
                    ModelState.AddModelError("Email", result.Message);
                    hasFieldErrors = true;
                }
                else
                {
                    ModelState.AddModelError(string.Empty, result.Message);
                }
            }
            else
            {
                ModelState.AddModelError(string.Empty, "Password reset failed. Please try again.");
            }

            TempData["ErrorMessage"] = result.Message ?? (hasFieldErrors ? "Please correct the highlighted errors." : "Password reset failed.");
            return View(model);
        }

        TempData["SuccessMessage"] = "Password has been reset successfully! Please sign in with your new password.";
        return RedirectToAction("Login");
    }

    [HttpPost]
    public async Task<IActionResult> ResendOtp([FromBody] ForgotPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request?.Email))
        {
            return BadRequest(new { success = false, message = "Email is required." });
        }

        var result = await _authApiClient.ForgotPasswordAsync(request.Email);
        if (!result.Success)
        {
            return BadRequest(new { success = false, message = result.Message ?? "Failed to resend OTP." });
        }

        return Ok(new { success = true, message = "A new OTP code has been sent to your email." });
    }
}
