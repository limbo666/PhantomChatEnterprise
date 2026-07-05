using Microsoft.EntityFrameworkCore;
using PhantomChatServer.Models;

namespace PhantomChatServer
{
    public class ChatDbContext : DbContext
    {
        public DbSet<User> Users { get; set; }
        public DbSet<Message> Messages { get; set; }
        public DbSet<ChatGroup> ChatGroups { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            // Αποθήκευση της βάσης στον ίδιο φάκελο με το .exe
            optionsBuilder.UseSqlite("Data Source=phantomchat.db");
        }
    }
}