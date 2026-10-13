namespace WebAPI.DTOs.Message;

public class FileMessageContent
{
    public string Url { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public string? Extension { get; set; }
    public string? ContentType { get; set; }
}
