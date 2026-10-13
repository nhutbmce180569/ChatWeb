using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using WebMVC.DTOs.User;

namespace WebMVC.Services.Implements;

public class UserApiClient : IUserApiClient
{
    private readonly HttpClient _httpClient;

    public UserApiClient(HttpClient httpClient)
    {
        _httpClient = httpClient;
    }

    public async Task<UserProfileDto?> GetProfileAsync(string token)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Get, "api/user/profile");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                return await response.Content.ReadFromJsonAsync<UserProfileDto>(new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
            }
            return null;
        }
        catch
        {
            return null;
        }
    }

    public async Task<(bool Success, string? ErrorMessage, UserProfileDto? Profile)> UpdateProfileAsync(string token, string displayName)
    {
        try
        {
            var request = new HttpRequestMessage(HttpMethod.Put, "api/user/profile");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = JsonContent.Create(new { DisplayName = displayName });

            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                var profile = await response.Content.ReadFromJsonAsync<UserProfileDto>(new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                return (true, null, profile);
            }

            var errJson = await response.Content.ReadAsStringAsync();
            string? msg = null;
            try
            {
                using var doc = JsonDocument.Parse(errJson);
                if (doc.RootElement.TryGetProperty("message", out var m)) msg = m.GetString();
            }
            catch { }

            return (false, msg ?? "Failed to update profile.", null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, null);
        }
    }

    public async Task<(bool Success, string? ErrorMessage, string? AvatarUrl)> UploadAvatarAsync(string token, IFormFile file)
    {
        try
        {
            using var formData = new MultipartFormDataContent();
            await using var stream = file.OpenReadStream();
            using var streamContent = new StreamContent(stream);
            streamContent.Headers.ContentType = new MediaTypeHeaderValue(string.IsNullOrWhiteSpace(file.ContentType) ? "image/jpeg" : file.ContentType);
            formData.Add(streamContent, "file", file.FileName);

            var request = new HttpRequestMessage(HttpMethod.Post, "api/user/avatar");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            request.Content = formData;

            var response = await _httpClient.SendAsync(request);
            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(content);
                string? url = null;
                if (doc.RootElement.TryGetProperty("avatarUrl", out var urlProp))
                {
                    url = urlProp.GetString();
                }
                return (true, null, url);
            }

            var errJson = await response.Content.ReadAsStringAsync();
            string? msg = null;
            try
            {
                using var doc = JsonDocument.Parse(errJson);
                if (doc.RootElement.TryGetProperty("message", out var m)) msg = m.GetString();
            }
            catch { }

            return (false, msg ?? "Failed to upload avatar.", null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message, null);
        }
    }
}
