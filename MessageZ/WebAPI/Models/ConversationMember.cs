using System;
using System.Collections.Generic;

namespace WebAPI.Models;

public partial class ConversationMember
{
    public Guid ConversationId { get; set; }

    public Guid UserId { get; set; }

    public DateTime JoinedAt { get; set; }

    public DateTime? LeftAt { get; set; }

    public bool IsAdmin { get; set; }

    public Guid? LastReadMessageId { get; set; }

    public virtual Conversation Conversation { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
