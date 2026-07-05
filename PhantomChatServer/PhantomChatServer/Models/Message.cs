using System;
using System.ComponentModel.DataAnnotations;

namespace PhantomChatServer.Models
{
    public class Message
    {
        [Key]
        public int Id { get; set; }
        public string SenderId { get; set; } = string.Empty;
        public string TargetId { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public string Channel { get; set; } = "Global";
    }
}