using System.ComponentModel.DataAnnotations;

namespace WebAPI.DTOs.Conversation;

public class CreateOneOnOneRequest
{
    [Required]
    public Guid TargetUserId { get; set; }
}
