using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebAPI.DTOs.Conversation;
using WebAPI.Services;

namespace WebAPI.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ConversationController : ControllerBase
{
    private readonly IConversationService _conversationService;

    public ConversationController(IConversationService conversationService)
    {
        _conversationService = conversationService;
    }

    private Guid? GetCurrentUserId()
    {
        var userIdString = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdString) || !Guid.TryParse(userIdString, out Guid currentUserId))
        {
            return null;
        }
        return currentUserId;
    }

    [HttpPost("one-on-one")]
    public async Task<IActionResult> CreateOneOnOneChat([FromBody] CreateOneOnOneRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.CreateOneOnOneChatAsync(currentUserId.Value, request);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("group")]
    public async Task<IActionResult> CreateGroupChat([FromBody] CreateGroupRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.CreateGroupChatAsync(currentUserId.Value, request);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpGet]
    public async Task<IActionResult> GetConversations()
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var data = await _conversationService.GetConversationsAsync(currentUserId.Value);
        return Ok(data);
    }

    [HttpGet("{id}/messages")]
    public async Task<IActionResult> GetMessages(Guid id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var data = await _conversationService.GetMessagesAsync(id, currentUserId.Value);
        return Ok(data);
    }

    [HttpGet("{id}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.GetGroupMembersAsync(id, currentUserId.Value);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("{id}/members")]
    public async Task<IActionResult> AddMembers(Guid id, [FromBody] AddGroupMembersRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.AddMembersToGroupAsync(id, currentUserId.Value, request);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Members added successfully." });
    }

    [HttpDelete("{id}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.RemoveMemberFromGroupAsync(id, currentUserId.Value, userId);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Member removed successfully." });
    }

    [HttpPost("{id}/leave")]
    public async Task<IActionResult> LeaveGroup(Guid id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.LeaveGroupAsync(id, currentUserId.Value);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Left group successfully." });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateGroupName(Guid id, [FromBody] UpdateGroupRequest request)
    {
        if (!ModelState.IsValid)
            return BadRequest(ModelState);

        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.UpdateGroupNameAsync(id, currentUserId.Value, request);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(new { message = "Group name updated successfully." });
    }

    [HttpPost("{id}/read")]
    public async Task<IActionResult> MarkAsRead(Guid id)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        await _conversationService.MarkAsReadAsync(id, currentUserId.Value);
        return Ok(new { message = "Marked as read." });
    }

    [HttpPost("{id}/images")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SendImage(Guid id, IFormFile file)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.SendImageAsync(id, currentUserId.Value, file);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("{id}/files")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SendFile(Guid id, IFormFile file)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.SendFileAsync(id, currentUserId.Value, file);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("{id}/voice")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SendVoice(Guid id, IFormFile file, [FromForm] double? duration)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.SendVoiceAsync(id, currentUserId.Value, file, duration);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("{id}/video")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> SendVideo(Guid id, IFormFile file, [FromForm] double? duration)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.SendVideoAsync(id, currentUserId.Value, file, duration);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }

    [HttpPost("{id}/messages/{messageId}/recall")]
    public async Task<IActionResult> RecallMessage(Guid id, Guid messageId)
    {
        var currentUserId = GetCurrentUserId();
        if (currentUserId == null)
            return Unauthorized();

        var result = await _conversationService.RecallMessageAsync(id, messageId, currentUserId.Value);
        if (!result.Success)
            return BadRequest(new { message = result.ErrorMessage });

        return Ok(result.Data);
    }
}
