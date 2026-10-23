using System.Net.Http.Json;
using System.Text.Json;
using WebMVC.DTOs.Auth;

namespace WebMVC.Services.Implements;

public class AuthApiClient : IAuthApiClient
{
    private readonly HttpClient _httpClient;

    public AuthApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<LoginActionResult> LoginAsync(LoginRequest request)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("api/auth/login", request);
            
            if (response.IsSuccessStatusCode)
            {
                var data = await response.Content.ReadFromJsonAsync<LoginResponse>();
                return new LoginActionResult { Success = true, Data = data };
            }

            var content = await response.Content.ReadAsStringAsync();
            string? errorMsg = null;
            if (!string.IsNullOrWhiteSpace(content))
            {
                try
                {
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp))
                    {
                        errorMsg = msgProp.GetString();
                    }
                }
                catch { }
            }

            return new LoginActionResult
            {
                Success = false,
                ErrorMessage = errorMsg ?? "Invalid email or password."
            };
        }
        catch (Exception)
        {
            return new LoginActionResult
            {
                Success = false,
                ErrorMessage = "Unable to connect to authentication server. Please try again."
            };
        }
    }

    public async Task<AuthActionResult> RegisterAsync(RegisterRequest request)
    {
        try
        {
            var apiPayload = new
            {
                Email = request.Email,
                Password = request.Password,
                Username = request.Username,
                DisplayName = request.DisplayName
            };

            var response = await _httpClient.PostAsJsonAsync("api/auth/register", apiPayload);
            return await ParseResponseAsync(response);
        }
        catch (Exception)
        {
            return new AuthActionResult
            {
                Success = false,
                Message = "Unable to connect to authentication server. Please try again."
            };
        }
    }

    public async Task<AuthActionResult> ForgotPasswordAsync(string email)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("api/auth/forgot-password", new { email });
            return await ParseResponseAsync(response);
        }
        catch (Exception)
        {
            return new AuthActionResult
            {
                Success = false,
                Message = "Unable to connect to authentication server. Please try again."
            };
        }
    }

    public async Task<AuthActionResult> VerifyOtpAsync(string email, string otp)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("api/auth/verify-otp", new { email, otp });
            return await ParseResponseAsync(response);
        }
        catch (Exception)
        {
            return new AuthActionResult
            {
                Success = false,
                Message = "Unable to connect to authentication server. Please try again."
            };
        }
    }

    public async Task<AuthActionResult> ResetPasswordAsync(string email, string otp, string newPassword)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync("api/auth/reset-password", new
            {
                email,
                otp,
                newPassword
            });
            return await ParseResponseAsync(response);
        }
        catch (Exception)
        {
            return new AuthActionResult
            {
                Success = false,
                Message = "Unable to connect to authentication server. Please try again."
            };
        }
    }

    private static async Task<AuthActionResult> ParseResponseAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode)
        {
            try
            {
                var okBody = await response.Content.ReadFromJsonAsync<JsonElement>();
                string? msg = okBody.TryGetProperty("message", out var m) ? m.GetString() : null;
                return new AuthActionResult { Success = true, Message = msg };
            }
            catch
            {
                return new AuthActionResult { Success = true };
            }
        }

        var result = new AuthActionResult { Success = false };
        var content = await response.Content.ReadAsStringAsync();

        if (!string.IsNullOrWhiteSpace(content))
        {
            try
            {
                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                if (root.TryGetProperty("errors", out var errorsProp) && errorsProp.ValueKind == JsonValueKind.Object)
                {
                    var dict = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
                    foreach (var prop in errorsProp.EnumerateObject())
                    {
                        var list = new List<string>();
                        if (prop.Value.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in prop.Value.EnumerateArray())
                            {
                                if (item.GetString() is { } str) list.Add(str);
                            }
                        }
                        dict[prop.Name] = list.ToArray();
                    }
                    result.ValidationErrors = dict;
                }

                if (root.TryGetProperty("message", out var msgProp))
                {
                    result.Message = msgProp.GetString();
                }

                if (root.TryGetProperty("field", out var fieldProp))
                {
                    result.Field = fieldProp.GetString();
                }
            }
            catch { }
        }

        return result;
    }
}
