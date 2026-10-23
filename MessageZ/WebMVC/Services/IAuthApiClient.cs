using WebMVC.DTOs.Auth;

namespace WebMVC.Services;

public interface IAuthApiClient
{
    Task<LoginActionResult> LoginAsync(LoginRequest request);
    Task<AuthActionResult> RegisterAsync(RegisterRequest request);
    Task<AuthActionResult> ForgotPasswordAsync(string email);
    Task<AuthActionResult> VerifyOtpAsync(string email, string otp);
    Task<AuthActionResult> ResetPasswordAsync(string email, string otp, string newPassword);
}
