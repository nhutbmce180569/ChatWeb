using System;
using System.Collections.Generic;

namespace WebAPI.Models;

public partial class Message
{
    public Guid Id { get; set; }

    public Guid ConversationId { get; set; }

    public Guid SenderId { get; set; }

    public string? Content { get; set; }

    public byte MessageType { get; set; }

    public DateTime SentAt { get; set; }

    public DateTime? EditedAt { get; set; }

    public DateTime? DeletedAt { get; set; }
 
    public bool IsRecalled { get; set; }

    public DateTime? RecalledAt { get; set; }

    public virtual Conversation Conversation { get; set; } = null!;

    public virtual User Sender { get; set; } = null!;
}
