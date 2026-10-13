using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace WebAPI.Services;

public interface IPhotoService
{
    Task<(bool Success, string? ErrorMessage, string? Url, string? PublicId)> UploadImageAsync(IFormFile file, string folder = "messagez/chats");
    Task<(bool Success, string? ErrorMessage)> DeleteImageAsync(string? imageUrl);
}
