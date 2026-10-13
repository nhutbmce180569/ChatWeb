using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.AspNetCore.Http;
using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace WebAPI.Services.Implements;

public class FileService : IFileService
{
    private readonly Cloudinary _cloudinary;
    private const long MaxRawFileSizeInBytes = 25 * 1024 * 1024; // 25MB
    private const long MaxAudioFileSizeInBytes = 15 * 1024 * 1024; // 15MB
    private const long MaxVideoFileSizeInBytes = 50 * 1024 * 1024; // 50MB

    private static readonly string[] BlockedExtensions = [
        ".exe", ".bat", ".cmd", ".sh", ".msi", ".dll", ".vbs", ".scr", ".com", ".pif"
    ];

    private static readonly string[] AllowedAudioExtensions = [
        ".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".oga", ".flac", ".opus"
    ];

    private static readonly string[] AllowedVideoExtensions = [
        ".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".3gp"
    ];

    public FileService(Cloudinary cloudinary)
    {
        _cloudinary = cloudinary;
    }

    public async Task<(bool Success, string? ErrorMessage, string? Url, string? FileName, long FileSize, string? Extension)> UploadRawFileAsync(IFormFile file, string folder = "messagez/files")
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Invalid or empty file.", null, null, 0, null);
        }

        if (file.Length > MaxRawFileSizeInBytes)
        {
            return (false, "File size exceeds the limit (max 25MB).", null, null, 0, null);
        }

        var fileName = Path.GetFileName(file.FileName);
        var extension = Path.GetExtension(fileName).ToLowerInvariant();

        if (BlockedExtensions.Contains(extension))
        {
            return (false, $"File extension '{extension}' is blocked for security reasons.", null, null, 0, null);
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var uploadParams = new RawUploadParams
            {
                File = new FileDescription(fileName, stream),
                Folder = folder,
                UseFilename = true,
                UniqueFilename = true
            };

            var uploadResult = await _cloudinary.UploadAsync(uploadParams);

            if (uploadResult.Error != null)
            {
                return (false, uploadResult.Error.Message, null, null, 0, null);
            }

            var url = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString();
            return (true, null, url, fileName, file.Length, extension);
        }
        catch (Exception ex)
        {
            return (false, $"File upload error: {ex.Message}", null, null, 0, null);
        }
    }

    public async Task<(bool Success, string? ErrorMessage, string? Url, double? Duration)> UploadAudioAsync(IFormFile file, string folder = "messagez/voices")
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Invalid or empty audio file.", null, null);
        }

        if (file.Length > MaxAudioFileSizeInBytes)
        {
            return (false, "Voice message size exceeds the limit (max 15MB).", null, null);
        }

        var fileName = Path.GetFileName(file.FileName);
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension))
        {
            extension = ".webm";
            fileName += extension;
        }

        if (!AllowedAudioExtensions.Contains(extension))
        {
            return (false, $"Audio format '{extension}' is not supported.", null, null);
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var uploadParams = new VideoUploadParams
            {
                File = new FileDescription(fileName, stream),
                Folder = folder
            };

            var uploadResult = await _cloudinary.UploadAsync(uploadParams);

            if (uploadResult.Error != null)
            {
                return (false, uploadResult.Error.Message, null, null);
            }

            var url = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString();
            double? duration = uploadResult.Duration > 0 ? uploadResult.Duration : null;
            return (true, null, url, duration);
        }
        catch (Exception ex)
        {
            return (false, $"Voice note upload error: {ex.Message}", null, null);
        }
    }

    public async Task<(bool Success, string? ErrorMessage, string? Url, double? Duration, string? ThumbnailUrl, string? FileName, long FileSize)> UploadVideoAsync(IFormFile file, string folder = "messagez/videos")
    {
        if (file == null || file.Length == 0)
        {
            return (false, "Invalid or empty video file.", null, null, null, null, 0);
        }

        if (file.Length > MaxVideoFileSizeInBytes)
        {
            return (false, "Video file size exceeds the limit (max 50MB).", null, null, null, null, 0);
        }

        var fileName = Path.GetFileName(file.FileName);
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (string.IsNullOrEmpty(extension))
        {
            extension = ".mp4";
            fileName += extension;
        }

        if (!AllowedVideoExtensions.Contains(extension))
        {
            return (false, $"Video format '{extension}' is not supported.", null, null, null, null, 0);
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var uploadParams = new VideoUploadParams
            {
                File = new FileDescription(fileName, stream),
                Folder = folder
            };

            var uploadResult = await _cloudinary.UploadAsync(uploadParams);

            if (uploadResult.Error != null)
            {
                return (false, uploadResult.Error.Message, null, null, null, null, 0);
            }

            double? duration = uploadResult.Duration > 0 ? uploadResult.Duration : null;
            if (duration.HasValue && duration.Value > 61.0)
            {
                // Delete video on Cloudinary due to exceeding maximum duration limit of 1 minute
                if (!string.IsNullOrEmpty(uploadResult.PublicId))
                {
                    try
                    {
                        await _cloudinary.DestroyAsync(new DeletionParams(uploadResult.PublicId) { ResourceType = ResourceType.Video });
                    }
                    catch { }
                }
                return (false, "Video duration exceeds the maximum limit (max 1 minute).", null, null, null, null, 0);
            }

            var url = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString();
            var thumbnailUrl = url != null ? System.Text.RegularExpressions.Regex.Replace(url, @"\.[a-zA-Z0-9]+$", ".jpg") : null;

            return (true, null, url, duration, thumbnailUrl, fileName, file.Length);
        }
        catch (Exception ex)
        {
            return (false, $"Video upload error: {ex.Message}", null, null, null, null, 0);
        }
    }

    public async Task<(bool Success, string? ErrorMessage)> DeleteCloudMediaAsync(string? content, byte messageType)
    {
        if (string.IsNullOrWhiteSpace(content))
        {
            return (true, null);
        }

        // Only MessageType 2 (Image), 3 (File), 5 (Voice), 6 (Video) have cloud media
        if (messageType != 2 && messageType != 3 && messageType != 5 && messageType != 6)
        {
            return (true, null);
        }

        try
        {
            string? url = null;
            var trimmedContent = content.Trim();

            // Extract URL from json if applicable
            if (trimmedContent.StartsWith("{") && trimmedContent.EndsWith("}"))
            {
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(trimmedContent);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("url", out var urlProp) || root.TryGetProperty("Url", out urlProp))
                    {
                        url = urlProp.GetString();
                    }
                }
                catch
                {
                    url = trimmedContent;
                }
            }
            else
            {
                url = trimmedContent;
            }

            if (string.IsNullOrWhiteSpace(url) || !url.Contains("cloudinary.com", StringComparison.OrdinalIgnoreCase))
            {
                return (true, null);
            }

            var resourceType = messageType switch
            {
                2 => ResourceType.Image,
                3 => ResourceType.Raw,
                5 => ResourceType.Video,
                6 => ResourceType.Video,
                _ => ResourceType.Image
            };

            // Extract publicId
            // Example URL: https://res.cloudinary.com/dxgqfxbwv/image/upload/v1728833445/messagez/chats/abc123xyz.jpg
            string publicId;
            var uploadIndex = url.IndexOf("/upload/", StringComparison.OrdinalIgnoreCase);
            if (uploadIndex >= 0)
            {
                var afterUpload = url.Substring(uploadIndex + "/upload/".Length);
                var segments = afterUpload.Split('/', StringSplitOptions.RemoveEmptyEntries);
                var relevantSegments = segments.SkipWhile(s => System.Text.RegularExpressions.Regex.IsMatch(s, @"^v\d+$") || s.Contains(',')).ToList();
                publicId = string.Join("/", relevantSegments);
            }
            else
            {
                var messagezIdx = url.IndexOf("messagez/", StringComparison.OrdinalIgnoreCase);
                publicId = messagezIdx >= 0 ? url.Substring(messagezIdx) : url;
            }

            // Remove query params if any
            var queryIdx = publicId.IndexOf('?');
            if (queryIdx >= 0) publicId = publicId.Substring(0, queryIdx);

            var lastDot = publicId.LastIndexOf('.');
            var lastSlash = publicId.LastIndexOf('/');
            var publicIdWithoutExt = (lastDot > 0 && lastDot > lastSlash) 
                ? publicId.Substring(0, lastDot) 
                : publicId;

            if (resourceType == ResourceType.Raw)
            {
                // Try deleting with full publicId (including extension) first
                var delParamsWithExt = new DeletionParams(publicId) { ResourceType = ResourceType.Raw };
                var res = await _cloudinary.DestroyAsync(delParamsWithExt);
                if (res.Result != "ok" && publicIdWithoutExt != publicId)
                {
                    var delParamsWithoutExt = new DeletionParams(publicIdWithoutExt) { ResourceType = ResourceType.Raw };
                    await _cloudinary.DestroyAsync(delParamsWithoutExt);
                }
            }
            else
            {
                // Image and Video/Audio use publicId without extension
                var delParams = new DeletionParams(publicIdWithoutExt) { ResourceType = resourceType };
                await _cloudinary.DestroyAsync(delParams);
            }

            return (true, null);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Cloudinary Delete Error]: {ex.Message}");
            return (false, $"Error deleting media from cloud: {ex.Message}");
        }
    }
}
