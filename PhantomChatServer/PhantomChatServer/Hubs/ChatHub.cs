using Microsoft.AspNetCore.SignalR;
using PhantomChatServer.Models;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace PhantomChatServer.Hubs
{
    public class ChatHub : Hub
    {
        private readonly ChatDbContext _db;
        private static readonly ConcurrentDictionary<string, string> ActiveConnections = new();
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> GroupMembers = new();

        public ChatHub(ChatDbContext db)
        {
            _db = db;
        }

        public async Task RegisterConnection(string uuid, string nickname)
        {
            ActiveConnections[uuid] = Context.ConnectionId;
            var user = _db.Users.FirstOrDefault(u => u.Uuid == uuid);
            if (user == null) { _db.Users.Add(new User { Uuid = uuid, Nickname = nickname }); }
            else if (user.Nickname != nickname) { user.Nickname = nickname; }
            await _db.SaveChangesAsync();
            await BroadcastActiveUsers();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var item = ActiveConnections.FirstOrDefault(kvp => kvp.Value == Context.ConnectionId);
            if (item.Key != null)
            {
                string uuid = item.Key;
                ActiveConnections.TryRemove(uuid, out _);
                await BroadcastActiveUsers();
                foreach (var group in GroupMembers)
                {
                    if (group.Value.TryRemove(uuid, out _)) await BroadcastGroupMembers(group.Key);
                }
            }
            await base.OnDisconnectedAsync(exception);
        }

        public async Task UpdateNickname(string uuid, string newNickname)
        {
            var user = _db.Users.FirstOrDefault(u => u.Uuid == uuid);
            if (user != null) { user.Nickname = newNickname; await _db.SaveChangesAsync(); }
            foreach (var group in GroupMembers.Values) { if (group.ContainsKey(uuid)) group[uuid] = newNickname; }
            await BroadcastActiveUsers();
            foreach (var group in GroupMembers.Keys) { await BroadcastGroupMembers(group); }
        }

        // Κεντρικός μηχανισμός για να κάνουν Refresh οι οθόνες των χρηστών
        private async Task NotifyRefresh(string requesterUuid, string target, bool isDm)
        {
            await RequestHistory(requesterUuid, target, isDm); // Ανανέωση αυτού που έκανε την ενέργεια

            if (isDm)
            {
                if (ActiveConnections.TryGetValue(target, out var targetConnectionId))
                    await Clients.Client(targetConnectionId).SendAsync("ForceRefresh", requesterUuid, true);
            }
            else if (target == "Global")
            {
                await Clients.Others.SendAsync("ForceRefresh", target, false);
            }
            else
            {
                await Clients.OthersInGroup(target).SendAsync("ForceRefresh", target, false);
            }
        }

        public async Task WipeMyHistory(string uuid, string target, bool isDm)
        {
            var messages = _db.Messages.Where(m => m.SenderId == uuid);
            messages = isDm ? messages.Where(m => m.Channel == "DM" && (m.TargetId == target || m.TargetId == uuid))
                            : messages.Where(m => m.Channel == target);
            _db.Messages.RemoveRange(messages);
            await _db.SaveChangesAsync();
            await NotifyRefresh(uuid, target, isDm);
        }

        // --- ΝΕΟ: Επεξεργασία Συγκεκριμένου Μηνύματος ---
        public async Task EditMessage(int messageId, string uuid, string newContent, string target, bool isDm)
        {
            var msg = _db.Messages.FirstOrDefault(m => m.Id == messageId && m.SenderId == uuid);
            if (msg != null)
            {
                msg.Content = newContent;
                await _db.SaveChangesAsync();
                await NotifyRefresh(uuid, target, isDm);
            }
        }

        // --- ΝΕΟ: Διαγραφή Συγκεκριμένου Μηνύματος ---
        public async Task DeleteSpecificMessage(int messageId, string uuid, string target, bool isDm)
        {
            var msg = _db.Messages.FirstOrDefault(m => m.Id == messageId && m.SenderId == uuid);
            if (msg != null)
            {
                _db.Messages.Remove(msg);
                await _db.SaveChangesAsync();
                await NotifyRefresh(uuid, target, isDm);
            }
        }

        private async Task BroadcastActiveUsers()
        {
            var activeUuids = ActiveConnections.Keys.ToList();
            var users = _db.Users.Where(u => activeUuids.Contains(u.Uuid)).Select(u => new { u.Uuid, u.Nickname }).ToList();
            await Clients.All.SendAsync("UpdateActiveUsers", users);
        }

        public async Task JoinGroupSecure(string groupName, string uuid, string nickname, string password, bool isNewJoin)
        {
            var group = _db.ChatGroups.FirstOrDefault(g => g.Name == groupName);
            if (group == null)
            {
                group = new ChatGroup { Name = groupName, CreatorId = uuid, Password = password ?? "" };
                _db.ChatGroups.Add(group);
                await _db.SaveChangesAsync();
            }
            else if (!string.IsNullOrEmpty(group.Password) && group.Password != password)
            {
                throw new HubException("INVALID_PASSWORD");
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            var members = GroupMembers.GetOrAdd(groupName, _ => new ConcurrentDictionary<string, string>());
            members[uuid] = nickname;

            if (isNewJoin)
            {
                long unixTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                await Clients.Group(groupName).SendAsync("ReceiveMessage", 0, "SYSTEM", "System", $"{nickname} joined the group.", groupName, "", unixTime);
            }
            await BroadcastGroupMembers(groupName);

            // Ενημερώνουμε το UI αν ο χρήστης είναι ο δημιουργός του Group
            await Clients.Caller.SendAsync("GroupOwnershipStatus", groupName, group.CreatorId == uuid);
        }

        public async Task ChangeGroupPassword(string groupName, string requesterUuid, string newPassword)
        {
            var group = _db.ChatGroups.FirstOrDefault(g => g.Name == groupName);
            if (group != null && group.CreatorId == requesterUuid)
            {
                group.Password = newPassword ?? "";
                await _db.SaveChangesAsync();
                long unixTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                await Clients.Caller.SendAsync("ReceiveMessage", 0, "SYSTEM", "System", $"Group password updated successfully.", groupName, "", unixTime);
            }
        }

        public async Task DeleteGroup(string groupName, string requesterUuid)
        {
            var group = _db.ChatGroups.FirstOrDefault(g => g.Name == groupName);
            if (group != null && group.CreatorId == requesterUuid)
            {
                var msgs = _db.Messages.Where(m => m.Channel == groupName);
                _db.Messages.RemoveRange(msgs);
                _db.ChatGroups.Remove(group);
                await _db.SaveChangesAsync();
                await Clients.Group(groupName).SendAsync("GroupDeleted", groupName);
            }
        }

        public async Task LeaveGroup(string groupName, string uuid, string nickname)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            if (GroupMembers.TryGetValue(groupName, out var members)) members.TryRemove(uuid, out _);
            long unixTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await Clients.Group(groupName).SendAsync("ReceiveMessage", 0, "SYSTEM", "System", $"{nickname} left the group.", groupName, "", unixTime);
            await BroadcastGroupMembers(groupName);
        }

        private async Task BroadcastGroupMembers(string groupName)
        {
            if (GroupMembers.TryGetValue(groupName, out var members))
            {
                var memberList = members.Select(m => new { Uuid = m.Key, Nickname = m.Value }).ToList();
                await Clients.Group(groupName).SendAsync("UpdateGroupMembers", groupName, memberList);
            }
        }

        public async Task RequestHistory(string requesterUuid, string target, bool isDm)
        {
            List<Message> history;
            if (isDm) { history = _db.Messages.Where(m => m.Channel == "DM" && ((m.SenderId == requesterUuid && m.TargetId == target) || (m.SenderId == target && m.TargetId == requesterUuid))).OrderByDescending(m => m.Timestamp).Take(50).ToList(); }
            else { history = _db.Messages.Where(m => m.Channel == target).OrderByDescending(m => m.Timestamp).Take(50).ToList(); }

            var formattedHistory = history.OrderBy(m => m.Timestamp).Select(m => new {
                Id = m.Id, // ΝΕΟ: Στέλνουμε το Id στο UI
                SenderUuid = m.SenderId,
                SenderNickname = _db.Users.FirstOrDefault(u => u.Uuid == m.SenderId)?.Nickname ?? "Anonymous",
                Content = m.Content,
                Channel = m.Channel,
                UnixTime = new DateTimeOffset(m.Timestamp).ToUnixTimeMilliseconds()
            }).ToList();

            await Clients.Caller.SendAsync("ReceiveHistory", formattedHistory);
        }

        public async Task SendMessage(string uuid, string nickname, string target, string message, bool isDm)
        {
            var newMsg = new Message { SenderId = uuid, TargetId = isDm ? target : string.Empty, Content = message, Timestamp = DateTime.UtcNow, Channel = isDm ? "DM" : target };
            _db.Messages.Add(newMsg);
            await _db.SaveChangesAsync();

            long unixTime = new DateTimeOffset(newMsg.Timestamp).ToUnixTimeMilliseconds();

            if (isDm)
            {
                if (ActiveConnections.TryGetValue(target, out var targetConnectionId))
                    await Clients.Client(targetConnectionId).SendAsync("ReceiveMessage", newMsg.Id, uuid, nickname, message, "DM", uuid, unixTime);
                await Clients.Caller.SendAsync("ReceiveMessage", newMsg.Id, uuid, nickname, message, "DM", target, unixTime);
            }
            else
            {
                if (target == "Global") await Clients.All.SendAsync("ReceiveMessage", newMsg.Id, uuid, nickname, message, "Global", "", unixTime);
                else await Clients.Group(target).SendAsync("ReceiveMessage", newMsg.Id, uuid, nickname, message, target, "", unixTime);
            }
        }
    }
}