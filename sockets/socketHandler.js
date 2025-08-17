// socket/socketHandler.js
const initializeSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Join a specific room (e.g., project room)
    socket.on('joinRoom', (room) => {
      socket.join(room);
      console.log(`User ${socket.id} joined room: ${room}`);
      
      // Notify other users in the room
      socket.to(room).emit('userJoined', {
        userId: socket.id,
        message: 'A user joined the room'
      });
    });

    // Leave a room
    socket.on('leaveRoom', (room) => {
      socket.leave(room);
      console.log(`User ${socket.id} left room: ${room}`);
      
      // Notify other users in the room
      socket.to(room).emit('userLeft', {
        userId: socket.id,
        message: 'A user left the room'
      });
    });

    // Handle task updates in real-time
    socket.on('taskStatusChange', (data) => {
      // Broadcast to all clients except sender
      socket.broadcast.emit('taskStatusChanged', data);
    });

    // Handle user typing (for future chat feature)
    socket.on('typing', (data) => {
      socket.to(data.room).emit('userTyping', {
        userId: socket.id,
        userName: data.userName
      });
    });

    socket.on('stopTyping', (data) => {
      socket.to(data.room).emit('userStoppedTyping', {
        userId: socket.id
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      
      // Notify all rooms that the user disconnected
      socket.broadcast.emit('userDisconnected', {
        userId: socket.id
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  // Handle server-level errors
  io.on('error', (error) => {
    console.error('Socket.IO server error:', error);
  });
};

module.exports = initializeSocket;