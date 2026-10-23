using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using WebMVC.DTOs.Admin;

namespace WebMVC.Services.Implements;

public class AdminApiClient : IAdminApiClient
{
    private readonly HttpClient _httpClient;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public AdminApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    private HttpRequestMessage CreateAuthorizedRequest(HttpMethod method, string uri, string token)
    {
        var request = new HttpRequestMessage(method, uri);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return request;
    }

    public async Task<AdminDashboardStatsDto?> GetStatsAsync(string token)
    {
        try
        {
            var request = CreateAuthorizedRequest(HttpMethod.Get, "api/admin/stats", token);
            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<AdminDashboardStatsDto>(JsonOptions);
            }
            return null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<PagedResult<AdminUserDto>?> GetUsersAsync(
        string token,
        string? search = null,
        string? role = null,
        bool? isActive = null,
        int page = 1,
        int pageSize = 15)
    {
        try
        {
            var queryParams = new List<string>
            {
                $"page={page}",
                $"pageSize={pageSize}"
            };

            if (!string.IsNullOrWhiteSpace(search))
                queryParams.Add($"search={Uri.EscapeDataString(search.Trim())}");

            if (!string.IsNullOrWhiteSpace(role) && !role.Equals("All", StringComparison.OrdinalIgnoreCase))
                queryParams.Add($"role={Uri.EscapeDataString(role.Trim())}");

            if (isActive.HasValue)
                queryParams.Add($"isActive={isActive.Value}");

            var url = $"api/admin/users?{string.Join("&", queryParams)}";
            var request = CreateAuthorizedRequest(HttpMethod.Get, url, token);
            var response = await _httpClient.SendAsync(request);

            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<PagedResult<AdminUserDto>>(JsonOptions);
            }
            return null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<(bool Success, string? Message)> UpdateUserStatusAsync(string token, Guid accountId, bool isActive)
    {
        try
        {
            var request = CreateAuthorizedRequest(HttpMethod.Put, $"api/admin/users/{accountId}/status", token);
            request.Content = JsonContent.Create(new { IsActive = isActive });

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            string? message = null;

            if (!string.IsNullOrWhiteSpace(content))
            {
                try
                {
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp))
                        message = msgProp.GetString();
                }
                catch { }
            }

            return (response.IsSuccessStatusCode, message ?? (response.IsSuccessStatusCode ? "Success" : "Failed to update user status"));
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Message)> UpdateUserRoleAsync(string token, Guid accountId, string role)
    {
        try
        {
            var request = CreateAuthorizedRequest(HttpMethod.Put, $"api/admin/users/{accountId}/role", token);
            request.Content = JsonContent.Create(new { Role = role });

            var response = await _httpClient.SendAsync(request);
            var content = await response.Content.ReadAsStringAsync();
            string? message = null;

            if (!string.IsNullOrWhiteSpace(content))
            {
                try
                {
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp))
                        message = msgProp.GetString();
                }
                catch { }
            }

            return (response.IsSuccessStatusCode, message ?? (response.IsSuccessStatusCode ? "Success" : "Failed to update user role"));
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }
}
