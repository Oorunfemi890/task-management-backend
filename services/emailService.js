// services/emailService.js
const nodemailer = require('nodemailer');

// Configure email transporter (use your preferred service)
const transporter = nodemailer.createTransport({
  // For development - use Ethereal Email or similar
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
  
  // For production - use services like:
  // Gmail, SendGrid, AWS SES, etc.
  // service: 'gmail',
  // auth: {
  //   user: process.env.EMAIL_USER,
  //   pass: process.env.EMAIL_PASS
  // }
});

const sendInvitationEmail = async ({ email, token, inviterName, roleName, message, expiresAt }) => {
  const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accept-invitation/${token}`;
  
  const emailContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Team Invitation - TaskFlow</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .message-box { background: white; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; }
        .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 You're Invited to Join TaskFlow!</h1>
        </div>
        <div class="content">
          <p>Hi there!</p>
          <p><strong>${inviterName}</strong> has invited you to join their team on TaskFlow as a <strong>${roleName}</strong>.</p>
          
          ${message ? `
            <div class="message-box">
              <h4>Personal message from ${inviterName}:</h4>
              <p><em>"${message}"</em></p>
            </div>
          ` : ''}
          
          <p>TaskFlow is a modern task management platform that helps teams collaborate efficiently and get work done.</p>
          
          <div style="text-align: center;">
            <a href="${inviteUrl}" class="button">Accept Invitation</a>
          </div>
          
          <p><strong>Important details:</strong></p>
          <ul>
            <li>This invitation expires on <strong>${new Date(expiresAt).toLocaleDateString()}</strong></li>
            <li>You'll be joining as a <strong>${roleName}</strong></li>
            <li>Click the button above to create your account</li>
          </ul>
          
          <p>If you can't click the button, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 4px;">${inviteUrl}</p>
          
          <div class="footer">
            <p>This invitation was sent to ${email}. If you weren't expecting this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.FROM_EMAIL || 'TaskFlow <noreply@taskflow.com>',
    to: email,
    subject: `You're invited to join ${inviterName}'s team on TaskFlow`,
    html: emailContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Invitation email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (user, invitation) => {
  const emailContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to TaskFlow!</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚀 Welcome to TaskFlow!</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name}!</p>
          <p>Your account has been successfully created. Welcome to the team!</p>
          
          <p><strong>Your account details:</strong></p>
          <ul>
            <li>Email: ${user.email}</li>
            <li>Role: ${invitation.role_name}</li>
            <li>Account created: ${new Date(user.created_at).toLocaleDateString()}</li>
          </ul>
          
          <p>You can now start using TaskFlow to manage tasks, collaborate with your team, and boost productivity.</p>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="button">Go to TaskFlow</a>
          </div>
          
          <p>If you have any questions, feel free to reach out to your team lead or check our help documentation.</p>
          
          <p>Happy task managing!</p>
          <p>The TaskFlow Team</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.FROM_EMAIL || 'TaskFlow <noreply@taskflow.com>',
    to: user.email,
    subject: 'Welcome to TaskFlow - Your account is ready!',
    html: emailContent
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Welcome email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

module.exports = {
  sendInvitationEmail,
  sendWelcomeEmail
};