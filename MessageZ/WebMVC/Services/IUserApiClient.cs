using Microsoft.AspNetCore.Http;
using WebMVC.DTOs.User;

namespace WebMVC.Services;

public interface IUserApiClient
{
    Task<UserProfileDto?> GetProfileAsync(string token);
    Task<(bool Success, string? ErrorMessage, UserProfileDto? Profile)> UpdateProfileAsync(string token, string displayName);
    Task<(bool Success, string? ErrorMessage, string? AvatarUrl)> UploadAvatarAsync(string token, IFormFile file);
}
