# Phantom Chat Enterprise
An advanced, enterprise-grade continuation of the original PhantomChat project.

While the original PhantomChat (https://github.com/limbo666/PhantomChat) focused on portable, offline messaging, Phantom Chat Enterprise evolves the architecture into a powerful, self-hosted real-time communication server certified and optimized for Windows environments. It is specifically designed for workplace networks, corporate intranets, and teams that require strict privacy, low-latency communication, and absolute control over their chat data.

## Overview
Phantom Chat Enterprise bridges the gap between lightweight instant messaging and strict corporate privacy requirements. Built on top of a persistent SQLite database and a high-performance WebSocket backend, it allows teams to communicate seamlessly across desktop and mobile modern browsers without relying on external cloud servers or third-party tracking.

## Key Features
Enterprise Privacy & Security
Password-Protected Chat Rooms: Users can create private, password-enforced chat rooms. Joining requires authentication, preventing unauthorized access across the network.

## Group Ownership & Management: 
Room creators retain administrative ownership, allowing them to change room passwords or permanently delete the group and all associated messages at any time.

Confidential Direct Messaging (DMs): Support for private, one-on-one direct messaging alongside standard group channels.

## Granular Data & History Control
Personal History Wipe: Users have absolute right-to-forget capabilities. A single action allows a user to completely purge all messages they have ever sent within a specific channel or direct message without affecting other users' logs.

Message Editing & Deletion: Users can edit or delete their individual messages in real time, with changes reflected immediately across all connected clients.

## High-Performance Architecture
Persistent SQLite Database: Fully integrated database engine ensures reliable message storage, user identification, and custom room persistence across server restarts.

Real-Time SignalR Engine: Powered by ASP.NET Core SignalR for bidirectional, ultra-low latency WebSocket communication with automatic reconnection handling.

Windows Certified: Optimized for native execution on Windows server and desktop environments with minimal overhead.


## Deployment & Running on Windows
Ensure the Windows environment has the .NET 8.0 Runtime (or SDK for development) installed.

Compile the project or unpack the release binaries into your desired local directory.

Launch PhantomChatServer.exe (or run dotnet run from the project root).

The server will automatically initialize the local phantomchat.db database and begin listening on your local IP address (defaulting to port 5000).

Access the web interface by pointing any modern browser (Chrome, Edge, Brave, Firefox) to http://localhost:5000 or the server's LAN IP address.
