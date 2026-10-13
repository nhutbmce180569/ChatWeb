namespace WebAPI.DTOs.Message;

public class VideoMessageContent
{
    public string Url { get; set; } = string.Empty;
    public double Duration { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? FileName { get; set; }
    public long FileSize { get; set; }
}
