import { describe, expect, it, vi } from 'vitest'
import { admin } from './admin'
import { Env } from '../db/BaseRepository'

// Helper to create mock Env
const createMockEnv = () => {
  const mockStmt = {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn(),
    first: vi.fn(),
    run: vi.fn(),
  }
  return {
    env: {
      ADMIN_PASSWORD: 'secret_password',
      DB: {
        prepare: vi.fn().mockReturnValue(mockStmt),
      },
    } as unknown as Env,
    stmt: mockStmt
  }
}

describe('Admin Handler', () => {
  it('should return 401 if unauthorized', async () => {
    const { env } = createMockEnv()
    const res = await admin.request('http://localhost/', {}, env)
    expect(res.status).toBe(401)
  })

  it('should return 200 if authorized', async () => {
    const { env } = createMockEnv()
    const credentials = btoa('admin:secret_password')
    const res = await admin.request('http://localhost/', {
      headers: { Authorization: `Basic ${credentials}` }
    }, env)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Admin Dashboard')
  })

  it('should list tables', async () => {
    const { env } = createMockEnv()
    const credentials = btoa('admin:secret_password')
    const res = await admin.request('http://localhost/', {
      headers: { Authorization: `Basic ${credentials}` }
    }, env)
    const text = await res.text()
    expect(text).toContain('users')
    expect(text).toContain('rooms')
  })

  it('should view table', async () => {
    const { env, stmt } = createMockEnv()
    const credentials = btoa('admin:secret_password')

    // Mock DB result
    const mockResults = [{ user_id: 'u1', display_name: 'Test User' }];
    stmt.all.mockResolvedValue({ results: mockResults });

    const res = await admin.request('http://localhost/table/users', {
      headers: { Authorization: `Basic ${credentials}` }
    }, env)

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Test User')
    expect(text).toContain('Edit') // Should have Edit link for users
    expect(text).toContain('Posts') // Should have Posts link for users
  })

  it('should view user posts', async () => {
    const { env, stmt } = createMockEnv()
    const credentials = btoa('admin:secret_password')

    const mockPosts = [
      { post_id: 'p1', timestamp: '2023-01-01', user_id: 'u1', message_text: 'Hello', has_poll: 0 }
    ];
    stmt.all.mockResolvedValue({ results: mockPosts });

    const res = await admin.request('http://localhost/users/u1/posts', {
        headers: { Authorization: `Basic ${credentials}` }
    }, env)

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Posts for User: u1')
    expect(text).toContain('Hello')
  })

  it('should show edit form', async () => {
    const { env, stmt } = createMockEnv()
    const credentials = btoa('admin:secret_password')

    const mockUser = { user_id: 'u1', display_name: 'Test User' };
    stmt.first.mockResolvedValue(mockUser);

    const res = await admin.request('http://localhost/users/u1/edit', {
        headers: { Authorization: `Basic ${credentials}` }
    }, env)

    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('value="Test User"')
  })

  it('should update user', async () => {
    const { env, stmt } = createMockEnv()
    const credentials = btoa('admin:secret_password')

    stmt.run.mockResolvedValue({});

    const formData = new FormData();
    formData.append('display_name', 'Updated Name');

    const res = await admin.request('http://localhost/users/u1/edit', {
        method: 'POST',
        headers: { Authorization: `Basic ${credentials}` },
        body: formData
    }, env)

    expect(res.status).toBe(302) // Redirect
    expect(res.headers.get('Location')).toBe('/admin/table/users')
    expect(env.DB.prepare).toHaveBeenCalledWith('UPDATE users SET display_name = ? WHERE user_id = ?')
  })
})
