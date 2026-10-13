using WebAPI.DTOs.Auth;

namespace WebAPI.Services;

public interface IAuthService
{
    Task<AuthResult<LoginResponse>> LoginAsync(LoginRequest request);
    Task<AuthResult<string>> RegisterAsync(RegisterRequest request);
}
