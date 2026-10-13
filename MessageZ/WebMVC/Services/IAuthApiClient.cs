using WebMVC.DTOs.Auth;

namespace WebMVC.Services;

public interface IAuthApiClient
{
    Task<LoginActionResult> LoginAsync(LoginRequest request);
    Task<AuthActionResult> RegisterAsync(RegisterRequest request);
}
