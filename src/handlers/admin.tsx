import { Hono } from 'hono'
import { basicAuth } from 'hono/basic-auth'
import { html } from 'hono/html'
import { Env } from '../db/BaseRepository'
import { PostRepository } from '../db/PostRepository'

const admin = new Hono<{ Bindings: Env }>()

const tables = ['users', 'rooms', 'posts', 'answers', 'translation_logs', 'debug_logs'];

admin.use(
  '*',
  async (c, next) => {
    const auth = basicAuth({
      verifyUser: (username, password, c) => {
        return username === 'admin' && password === c.env.ADMIN_PASSWORD
      },
    })
    return auth(c, next)
  }
)

admin.get('/', (c) => {
  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Admin Dashboard</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          a { display: block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <h1>Admin Dashboard</h1>
        <h2>Tables</h2>
        <ul>
          ${tables.map(t => html`<li><a href="/admin/table/${t}">${t}</a></li>`)}
        </ul>
      </body>
    </html>
  `)
})

admin.get('/table/:tableName', async (c) => {
  const tableName = c.req.param('tableName');
  if (!tables.includes(tableName)) {
    return c.text('Table not found', 404);
  }

  // Use 'rowid' if available (SQLite), otherwise rely on LIMIT
  const result = await c.env.DB.prepare(`SELECT * FROM ${tableName} ORDER BY rowid DESC LIMIT 100`).all();
  const rows = result.results || [];
  const columns = rows.length > 0 ? Object.keys(rows[0] as object) : [];

  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${tableName}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .back { margin-bottom: 20px; display: inline-block; }
        </style>
      </head>
      <body>
        <a href="/admin" class="back">Back to Dashboard</a>
        <h1>${tableName}</h1>
        <table>
          <thead>
            <tr>
              ${columns.map(col => html`<th>${col}</th>`)}
              ${tableName === 'users' ? html`<th>Action</th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => html`
              <tr>
                ${columns.map(col => html`<td>${(row as any)[col]}</td>`)}
                ${tableName === 'users' ? html`<td>
                  <a href="/admin/users/${(row as any).user_id}/edit">Edit</a>
                  <a href="/admin/users/${(row as any).user_id}/posts">Posts</a>
                </td>` : ''}
              </tr>
            `)}
          </tbody>
        </table>
      </body>
    </html>
  `)
})

admin.get('/users/:userId/edit', async (c) => {
  const userId = c.req.param('userId');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();

  if (!user) {
    return c.text('User not found', 404);
  }

  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Edit User</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          form { max-width: 400px; margin: 20px 0; }
          label { display: block; margin-bottom: 5px; }
          input { width: 100%; padding: 8px; margin-bottom: 15px; }
          button { padding: 10px 20px; }
          .back { margin-bottom: 20px; display: inline-block; }
        </style>
      </head>
      <body>
        <a href="/admin/table/users" class="back">Back to Users</a>
        <h1>Edit User</h1>
        <form method="POST">
          <label>User ID</label>
          <input type="text" value="${(user as any).user_id}" disabled />

          <label>Display Name</label>
          <input type="text" name="display_name" value="${(user as any).display_name || ''}" />

          <button type="submit">Update</button>
        </form>
      </body>
    </html>
  `)
})

admin.post('/users/:userId/edit', async (c) => {
  const userId = c.req.param('userId');
  const body = await c.req.parseBody();
  const displayName = body['display_name'] as string;

  await c.env.DB.prepare('UPDATE users SET display_name = ? WHERE user_id = ?')
    .bind(displayName, userId)
    .run();

  return c.redirect('/admin/table/users');
})

admin.get('/users/:userId/posts', async (c) => {
  const userId = c.req.param('userId');
  const postRepository = new PostRepository(c.env);
  const posts = await postRepository.findAllByUserId(userId, 100);

  return c.html(html`
    <!DOCTYPE html>
    <html>
      <head>
        <title>User Posts</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .back { margin-bottom: 20px; display: inline-block; }
        </style>
      </head>
      <body>
        <a href="/admin/table/users" class="back">Back to Users</a>
        <h1>Posts for User: ${userId}</h1>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Room ID</th>
              <th>Message</th>
              <th>Poll</th>
              <th>Translated Text</th>
            </tr>
          </thead>
          <tbody>
            ${posts.map(post => html`
              <tr>
                <td>${post.timestamp}</td>
                <td>${post.room_id || '-'}</td>
                <td>${post.message_text}</td>
                <td>${post.has_poll ? 'Yes' : 'No'}</td>
                <td>${post.translated_text || '-'}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </body>
    </html>
  `)
})

export { admin }
