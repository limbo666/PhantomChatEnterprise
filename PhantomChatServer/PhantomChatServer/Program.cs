using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;
using System.Net;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();
builder.Services.AddDbContext<PhantomChatServer.ChatDbContext>();
// --- SETUP DETAILS: Port Configuration ---
// Change 5000 to any preferred port number if needed.
int hostingPort = 5000;

builder.WebHost.ConfigureKestrel(options =>
{
    options.Listen(IPAddress.Any, hostingPort);
});

var app = builder.Build();
// Αυτόματη δημιουργία της βάσης SQLite (αν δεν υπάρχει)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PhantomChatServer.ChatDbContext>();
    db.Database.EnsureCreated();
}

if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

// Enable serving static files from wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHub<PhantomChatServer.Hubs.ChatHub>("/chatHub");
app.Run();