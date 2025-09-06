// controllers/inviteController.js
// ===========================================
const pool = require('../config/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sendInvitationEmail, sendWelcomeEmail } = require('../services/emailService');

const inviteController = {
  // Send email invitations
  sendInvitations: async (req, res) => {
    try {
      const { emails, roleId, message } = req.body;
      const invitedBy = req.user.id;

      // Validate input
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: 'Emails are required' });
      }

      if (!roleId) {
        return res.status(400).json({ error: 'Role is required' });
      }

      // Check permissions
      if (!await canInviteUsers(req.user)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to invite users'
        });
      }

      // Validate role exists and user can assign it
      const roleResult = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
      if (roleResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid role specified' });
      }

      const role = roleResult.rows[0];
      if (!await canAssignRole(req.user, role)) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You cannot assign the ${role.name} role`
        });
      }

      const results = [];
      
      for (const email of emails) {
        const trimmedEmail = email.trim().toLowerCase();
        
        if (!trimmedEmail) continue;

        try {
          // Check if user already exists
          const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [trimmedEmail]);
          if (existingUser.rows.length > 0) {
            results.push({ email: trimmedEmail, status: 'error', message: 'User already exists' });
            continue;
          }

          // Check for existing pending invitation
          const existingInvite = await pool.query(
            'SELECT id FROM invitations WHERE email = $1 AND status = $2 AND expires_at > NOW()',
            [trimmedEmail, 'pending']
          );

          if (existingInvite.rows.length > 0) {
            results.push({ email: trimmedEmail, status: 'error', message: 'Pending invitation already exists' });
            continue;
          }

          // Generate secure token
          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

          // Create invitation
          const inviteResult = await pool.query(`
            INSERT INTO invitations (email, token, role_id, invited_by, message, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
          `, [trimmedEmail, token, roleId, invitedBy, message, expiresAt]);

          // Send email
          try {
            await sendInvitationEmail({
              email: trimmedEmail,
              token,
              inviterName: req.user.name,
              roleName: role.name,
              message,
              expiresAt
            });

            results.push({ email: trimmedEmail, status: 'success', message: 'Invitation sent successfully' });
          } catch (emailError) {
            console.error(`Error sending email to ${trimmedEmail}:`, emailError);
            // Delete the invitation if email failed
            await pool.query('DELETE FROM invitations WHERE id = $1', [inviteResult.rows[0].id]);
            results.push({ email: trimmedEmail, status: 'error', message: 'Failed to send email' });
          }

        } catch (error) {
          console.error(`Error inviting ${trimmedEmail}:`, error);
          results.push({ email: trimmedEmail, status: 'error', message: 'Failed to create invitation' });
        }
      }

      res.json({ results });
    } catch (error) {
      console.error('Error sending invitations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Generate invite link
  generateInviteLink: async (req, res) => {
    try {
      const { roleId, maxUses, expiresIn } = req.body;
      const createdBy = req.user.id;

      // Check permissions
      if (!await canCreateInviteLinks(req.user)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to create invite links'
        });
      }

      // Validate role
      const roleResult = await pool.query('SELECT * FROM roles WHERE id = $1', [roleId]);
      if (roleResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid role specified' });
      }

      const role = roleResult.rows[0];
      if (!await canAssignRole(req.user, role)) {
        return res.status(403).json({
          error: 'Access denied',
          message: `You cannot create invite links for the ${role.name} role`
        });
      }

      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + (expiresIn || 7 * 24 * 60 * 60 * 1000));

      // Create invite link
      const linkResult = await pool.query(`
        INSERT INTO invite_links (token, role_id, created_by, max_uses, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, token
      `, [token, roleId, createdBy, maxUses || null, expiresAt]);

      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${token}`;

      res.json({
        id: linkResult.rows[0].id,
        link: inviteLink,
        token,
        maxUses: maxUses || null,
        expiresAt,
        roleName: role.name
      });
    } catch (error) {
      console.error('Error generating invite link:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get invitation details
  getInvitationDetails: async (req, res) => {
    try {
      const { token } = req.params;

      const result = await pool.query(`
        SELECT i.email, i.message, i.expires_at, i.status,
               r.name as role_name, r.description as role_description,
               u.name as inviter_name
        FROM invitations i
        JOIN roles r ON i.role_id = r.id
        JOIN users u ON i.invited_by = u.id
        WHERE i.token = $1
      `, [token]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found' });
      }

      const invitation = result.rows[0];

      if (invitation.status !== 'pending') {
        return res.status(400).json({
          error: 'Invitation already processed',
          status: invitation.status
        });
      }

      if (new Date() > new Date(invitation.expires_at)) {
        // Mark as expired
        await pool.query(
          'UPDATE invitations SET status = $1, updated_at = NOW() WHERE token = $2',
          ['expired', token]
        );
        return res.status(400).json({ error: 'Invitation expired' });
      }

      res.json({
        email: invitation.email,
        message: invitation.message,
        roleName: invitation.role_name,
        roleDescription: invitation.role_description,
        inviterName: invitation.inviter_name,
        expiresAt: invitation.expires_at
      });
    } catch (error) {
      console.error('Error getting invitation details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Accept invitation
  acceptInvitation: async (req, res) => {
    try {
      const { token } = req.params;
      const { name, password } = req.body;

      // Validate input
      if (!name || !password) {
        return res.status(400).json({ error: 'Name and password are required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      // Find invitation
      const inviteResult = await pool.query(`
        SELECT i.*, r.name as role_name, r.permissions, u.name as inviter_name
        FROM invitations i
        JOIN roles r ON i.role_id = r.id
        JOIN users u ON i.invited_by = u.id
        WHERE i.token = $1 AND i.status = 'pending' AND i.expires_at > NOW()
      `, [token]);

      if (inviteResult.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired invitation' });
      }

      const invitation = inviteResult.rows[0];

      // Check if user already exists
      const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [invitation.email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'An account with this email already exists' });
      }

      // Start transaction
      await pool.query('BEGIN');

      try {
        // Create user account
        const hashedPassword = await bcrypt.hash(password, 12);
        const userResult = await pool.query(`
          INSERT INTO users (name, email, password, role, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          RETURNING id, name, email, role, created_at
        `, [name, invitation.email, hashedPassword, invitation.role_name]);

        const newUser = userResult.rows[0];

        // Assign role to user
        await pool.query(`
          INSERT INTO user_roles (user_id, role_id, assigned_by)
          VALUES ($1, $2, $3)
        `, [newUser.id, invitation.role_id, invitation.invited_by]);

        // Update invitation status
        await pool.query(`
          UPDATE invitations 
          SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
          WHERE id = $1
        `, [invitation.id]);

        await pool.query('COMMIT');

        // Generate JWT token for immediate login - FIXED PAYLOAD
        const authToken = jwt.sign(
          { 
            userId: newUser.id,  // Fixed: use userId instead of id
            email: newUser.email,
            role: invitation.role_name 
          },
          process.env.JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.status(201).json({
          message: 'Account created successfully',
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: invitation.role_name,
            created_at: newUser.created_at
          },
          token: authToken
        });

        // Send welcome email (async, don't wait)
        sendWelcomeEmail(newUser, invitation).catch(console.error);

      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get available roles for invitation
  getAvailableRoles: async (req, res) => {
    try {
      const currentUser = req.user;
      
      let rolesQuery = 'SELECT id, name, description FROM roles WHERE 1=1';
      const queryParams = [];

      // Filter roles based on user permissions
      if (currentUser.role !== 'admin') {
        // Managers can only assign member roles
        if (currentUser.role === 'manager') {
          rolesQuery += ' AND name = $1';
          queryParams.push('member');
        } else {
          // Regular members can't assign any roles
          return res.json([]);
        }
      }

      rolesQuery += ' ORDER BY name';

      const result = await pool.query(rolesQuery, queryParams);
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching available roles:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get user's invitations
  getMyInvitations: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await pool.query(`
        SELECT i.id, i.email, i.status, i.expires_at, i.created_at,
               r.name as role_name,
               CASE WHEN i.expires_at < NOW() THEN true ELSE false END as is_expired
        FROM invitations i
        JOIN roles r ON i.role_id = r.id
        WHERE i.invited_by = $1
        ORDER BY i.created_at DESC
      `, [userId]);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching user invitations:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Revoke invitation
  revokeInvitation: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if invitation belongs to user or if user is admin
      const inviteResult = await pool.query(`
        SELECT i.* FROM invitations i 
        WHERE i.id = $1 AND (i.invited_by = $2 OR $3 = 'admin')
      `, [id, userId, req.user.role]);

      if (inviteResult.rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found or access denied' });
      }

      const invitation = inviteResult.rows[0];

      if (invitation.status !== 'pending') {
        return res.status(400).json({ error: 'Can only revoke pending invitations' });
      }

      // Update invitation status
      await pool.query(
        'UPDATE invitations SET status = $1, updated_at = NOW() WHERE id = $2',
        ['rejected', id]
      );

      res.json({ message: 'Invitation revoked successfully' });
    } catch (error) {
      console.error('Error revoking invitation:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

// Permission helper functions
async function canInviteUsers(user) {
  // Simplified permission check
  return ['admin', 'manager'].includes(user.role);
}

async function canAssignRole(user, targetRole) {
  // Admins can assign any role
  if (user.role === 'admin') return true;
  
  // Managers can assign member role only
  if (user.role === 'manager' && targetRole.name === 'member') return true;
  
  return false;
}

async function canCreateInviteLinks(user) {
  return user.role === 'admin' || user.role === 'manager';
}

module.exports = inviteController;