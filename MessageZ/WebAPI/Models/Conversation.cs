using System;
using System.Collections.Generic;

namespace WebAPI.Models;

public partial class Conversation
{
    public Guid Id { get; set; }

    public string? Name { get; set; }

    public byte Type { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public virtual ICollection<ConversationMember> ConversationMembers { get; set; } = new List<ConversationMember>();

    public virtual User CreatedByNavigation { get; set; } = null!;

    public virtual ICollection<Message> Messages { get; set; } = new List<Message>();
}
