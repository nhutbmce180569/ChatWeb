using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace WebAPI.Services;

public interface IFileService
{
    Task<(bool Success, string? ErrorMessage, string? Url, string? FileName, long FileSize, string? Extension)> UploadRawFileAsync(IFormFile file, string folder = "messagez/files");
    Task<(bool Success, string? ErrorMessage, string? Url, double? Duration)> UploadAudioAsync(IFormFile file, string folder = "messagez/voices");
    Task<(bool Success, string? ErrorMessage, string? Url, double? Duration, string? ThumbnailUrl, string? FileName, long FileSize)> UploadVideoAsync(IFormFile file, string folder = "messagez/videos");
    Task<(bool Success, string? ErrorMessage)> DeleteCloudMediaAsync(string? content, byte messageType);
}
