using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace WebAPI.Services.Implements;

public class PhotoService : IPhotoService
{
    private readonly Cloudinary _cloudinary;
    private static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    private const long MaxFileSizeInBytes = 10 * 1024 * 1024; // 10MB

    public PhotoService(Cloudinary cloudinary)
    {
        _cloudinary = cloudinary;
    }

    public async Task<(bool Success, string? ErrorMessage, string? Url, string? PublicId)> UploadImageAsync(IFormFile file, string folder = "messagez/chats")
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Invalid or empty image file.", null, null);
        }

        if (file.Length > MaxFileSizeInBytes)
        {
            return (false, "Image file size exceeds the limit (max 10MB).", null, null);
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
        {
            return (false, "Unsupported image format. Please upload JPG, PNG, WEBP, or GIF.", null, null);
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var uploadParams = new ImageUploadParams
            {
                File = new FileDescription(file.FileName, stream),
                Folder = folder,
                Transformation = new Transformation().Quality("auto").FetchFormat("auto")
            };

            var uploadResult = await _cloudinary.UploadAsync(uploadParams);

            if (uploadResult.Error != null)
            {
                return (false, uploadResult.Error.Message, null, null);
            }

            var url = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString();
            return (true, null, url, uploadResult.PublicId);
        }
        catch (Exception ex)
        {
            return (false, $"Image upload error: {ex.Message}", null, null);
        }
    }

    public async Task<(bool Success, string? ErrorMessage)> DeleteImageAsync(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return (true, null);
        }

        // Only delete images hosted on Cloudinary
        if (!imageUrl.Contains("cloudinary.com", StringComparison.OrdinalIgnoreCase))
        {
            return (true, null);
        }

        try
        {
            // Extract publicId from Cloudinary URL
            // Examples:
            // https://res.cloudinary.com/cloud/image/upload/v1728833445/messagez/avatars/abc123xyz.jpg
            // https://res.cloudinary.com/cloud/image/upload/messagez/avatars/abc123xyz.png
            string publicId;
            var uploadIndex = imageUrl.IndexOf("/upload/", StringComparison.OrdinalIgnoreCase);
            if (uploadIndex >= 0)
            {
                var afterUpload = imageUrl.Substring(uploadIndex + "/upload/".Length);
                var segments = afterUpload.Split('/', StringSplitOptions.RemoveEmptyEntries);
                var relevantSegments = segments
                    .SkipWhile(s => Regex.IsMatch(s, @"^v\d+$") || s.Contains(','))
                    .ToList();
                publicId = string.Join("/", relevantSegments);
            }
            else
            {
                var messagezIdx = imageUrl.IndexOf("messagez/", StringComparison.OrdinalIgnoreCase);
                publicId = messagezIdx >= 0 ? imageUrl.Substring(messagezIdx) : imageUrl;
            }

            // Remove query params if any
            var queryIdx = publicId.IndexOf('?');
            if (queryIdx >= 0) publicId = publicId.Substring(0, queryIdx);

            // Cloudinary image public_id must not include file extension
            var lastDot = publicId.LastIndexOf('.');
            var lastSlash = publicId.LastIndexOf('/');
            var publicIdWithoutExt = (lastDot > 0 && lastDot > lastSlash)
                ? publicId.Substring(0, lastDot)
                : publicId;

            if (string.IsNullOrWhiteSpace(publicIdWithoutExt))
            {
                return (true, null);
            }

            var delParams = new DeletionParams(publicIdWithoutExt)
            {
                ResourceType = ResourceType.Image
            };

            var delResult = await _cloudinary.DestroyAsync(delParams);

            if (delResult.Result != "ok" && delResult.Result != "not found")
            {
                Console.WriteLine($"[Cloudinary Delete Avatar Warning]: Result = {delResult.Result}, Error = {delResult.Error?.Message}");
            }

            return (true, null);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Cloudinary Delete Avatar Error]: {ex.Message}");
            return (false, $"Error deleting old image from cloud: {ex.Message}");
        }
    }
}
