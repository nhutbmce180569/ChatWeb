using WebAPI.DTOs.Auth;

namespace WebAPI.Services;

public interface IAuthService
{
    Task<AuthResult<LoginResponse>> LoginAsync(LoginRequest request);
    Task<AuthResult<string>> RegisterAsync(RegisterRequest request);
    Task<AuthResult<string>> ForgotPasswordAsync(ForgotPasswordRequest request);
    Task<AuthResult<string>> VerifyOtpAsync(VerifyOtpRequest request);
    Task<AuthResult<string>> ResetPasswordAsync(ResetPasswordRequest request);
}
