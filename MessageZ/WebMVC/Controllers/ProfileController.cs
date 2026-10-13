using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebMVC.DTOs.User;
using WebMVC.Services;

namespace WebMVC.Controllers;

[Authorize]
public class ProfileController : Controller
{
    private readonly IUserApiClient _userApiClient;

    public ProfileController(IUserApiClient userApiClient)
    {
        _userApiClient = userApiClient;
    }

    [HttpGet]
    public async Task<IActionResult> Index()
    {
        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
        {
            return RedirectToAction("Login", "Auth");
        }

        var profile = await _userApiClient.GetProfileAsync(token);
        if (profile == null)
        {
            TempData["ErrorMessage"] = "Session expired or profile could not be loaded. Please sign in again.";
            return RedirectToAction("Login", "Auth");
        }

        var viewModel = new UpdateProfileViewModel
        {
            DisplayName = profile.DisplayName,
            Username = profile.Username,
            Email = profile.Email,
            AvatarUrl = profile.AvatarUrl,
            CreatedAt = profile.CreatedAt
        };

        // Sync cookie claims so header avatar and name are always up-to-date
        var currentAvatar = User.FindFirst("AvatarUrl")?.Value;
        var currentDisplay = User.FindFirst("DisplayName")?.Value;
        if (currentAvatar != profile.AvatarUrl || currentDisplay != profile.DisplayName)
        {
            await UpdateCookieClaimsAsync(profile.DisplayName, profile.AvatarUrl);
        }

        return View(viewModel);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Update(UpdateProfileViewModel model)
    {
        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
        {
            return RedirectToAction("Login", "Auth");
        }

        if (!ModelState.IsValid)
        {
            TempData["ErrorMessage"] = "Please provide a valid display name.";
            return View("Index", model);
        }

        // Upload avatar if a file was provided via form submit
        if (model.AvatarFile != null && model.AvatarFile.Length > 0)
        {
            var avatarResult = await _userApiClient.UploadAvatarAsync(token, model.AvatarFile);
            if (!avatarResult.Success)
            {
                TempData["ErrorMessage"] = avatarResult.ErrorMessage ?? "Failed to upload avatar.";
                return View("Index", model);
            }
            model.AvatarUrl = avatarResult.AvatarUrl;
        }

        var updateResult = await _userApiClient.UpdateProfileAsync(token, model.DisplayName);
        if (!updateResult.Success)
        {
            TempData["ErrorMessage"] = updateResult.ErrorMessage ?? "Failed to update profile.";
            return View("Index", model);
        }

        await UpdateCookieClaimsAsync(model.DisplayName, model.AvatarUrl);

        TempData["SuccessMessage"] = "Profile updated successfully!";
        return RedirectToAction("Index");
    }

    [HttpPost]
    public async Task<IActionResult> UploadAvatarAjax(IFormFile file)
    {
        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
        {
            return Unauthorized(new { success = false, message = "Authentication token missing." });
        }

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { success = false, message = "No image file provided." });
        }

        var result = await _userApiClient.UploadAvatarAsync(token, file);
        if (!result.Success || string.IsNullOrEmpty(result.AvatarUrl))
        {
            return BadRequest(new { success = false, message = result.ErrorMessage ?? "Avatar upload failed." });
        }

        await UpdateCookieClaimsAsync(newAvatarUrl: result.AvatarUrl);

        return Json(new { success = true, avatarUrl = result.AvatarUrl, message = "Avatar uploaded to Cloudinary successfully!" });
    }

    [HttpPost]
    public async Task<IActionResult> UpdateNameAjax([FromBody] UpdateNameAjaxRequest req)
    {
        var token = User.FindFirst("Token")?.Value;
        if (string.IsNullOrEmpty(token))
        {
            return Unauthorized(new { success = false, message = "Authentication token missing." });
        }

        if (req == null || string.IsNullOrWhiteSpace(req.DisplayName) || req.DisplayName.Trim().Length < 2)
        {
            return BadRequest(new { success = false, message = "Display name must be at least 2 characters." });
        }

        var result = await _userApiClient.UpdateProfileAsync(token, req.DisplayName.Trim());
        if (!result.Success)
        {
            return BadRequest(new { success = false, message = result.ErrorMessage ?? "Failed to update display name." });
        }

        if (result.Profile != null)
        {
            await UpdateCookieClaimsAsync(newDisplayName: result.Profile.DisplayName);
        }

        return Json(new { success = true, displayName = result.Profile?.DisplayName, message = "Display name updated successfully!" });
    }

    private async Task UpdateCookieClaimsAsync(string? newDisplayName = null, string? newAvatarUrl = null)
    {
        if (User.Identity is not ClaimsIdentity currentIdentity)
            return;

        var claims = currentIdentity.Claims.ToList();

        if (newDisplayName != null)
        {
            claims.RemoveAll(c => c.Type == "DisplayName");
            if (!string.IsNullOrEmpty(newDisplayName))
                claims.Add(new Claim("DisplayName", newDisplayName));
        }

        if (newAvatarUrl != null)
        {
            claims.RemoveAll(c => c.Type == "AvatarUrl");
            if (!string.IsNullOrEmpty(newAvatarUrl))
                claims.Add(new Claim("AvatarUrl", newAvatarUrl));
        }

        var newIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await HttpContext.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(newIdentity),
            new AuthenticationProperties
            {
                IsPersistent = true,
                ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
            });
    }
}

public class UpdateNameAjaxRequest
{
    public string DisplayName { get; set; } = null!;
}
