using System.ComponentModel.DataAnnotations;

namespace PhantomChatServer.Models
{
    public class User
    {
        [Key]
        public string Uuid { get; set; } = string.Empty;
        public string Nickname { get; set; } = string.Empty;
        public string RetentionPolicy { get; set; } = "Keep Forever";
    }
}