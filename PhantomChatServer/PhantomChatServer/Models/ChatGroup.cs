using System.ComponentModel.DataAnnotations;

namespace PhantomChatServer.Models
{
    public class ChatGroup
    {
        [Key]
        public string Name { get; set; } = string.Empty;
        public string CreatorId { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }
}