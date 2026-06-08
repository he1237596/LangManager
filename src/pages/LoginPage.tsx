import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, message, Space } from 'antd'
import { MailOutlined, LockOutlined } from '@ant-design/icons'
import { useAuth } from '@/contexts/AuthContext'

const { Title, Text } = Typography

/** 清除本地残留的 supabase session，避免旧 token 干扰新登录 */
function cleanStaleSession() {
  const storageKey = 'sb-xonrngcdkvcvslnlwhis-auth-token'
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const session = JSON.parse(raw)
      if (session?.expires_at) {
        const remaining = session.expires_at - Math.round(Date.now() / 1000)
        console.log('[LoginPage] 发现旧 session，剩余', remaining, '秒')
        if (remaining < 60 || !session.access_token) {
          console.log('[LoginPage] session 即将过期或无效，清除')
          localStorage.removeItem(storageKey)
        }
      }
    }
  } catch { /* ignore */ }
}

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  // 进入登录页时自动清理 60 秒内过期的旧 session
  useEffect(() => {
    cleanStaleSession()
  }, [])

  const onFinish = async (values: { email: string; password: string }) => {
    setLoading(true)
    try {
      const { error } = await signIn(values.email, values.password)
      if (error) {
        setLoading(false)
        message.error(error)
      } else {
        message.success('登录成功')
        window.location.href = '/'
      }
    } catch (err) {
      console.error('Login error:', err)
      setLoading(false)
      message.error('登录失败，请重试')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card
        style={{ width: 420, boxShadow: '0 8px 40px rgba(0,0,0,0.12)', borderRadius: 12 }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={2} style={{ marginBottom: 4 }}>LangManager</Title>
          <Text type="secondary">多语言管理系统</Text>
        </div>

        <Form
          name="login"
          onFinish={onFinish}
          layout="vertical"
          size="large"
          autoComplete="off"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{ borderRadius: 6 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Space>
            <Link to="/register">注册账号</Link>
            <Link to="/forgot-password">忘记密码</Link>
          </Space>
        </div>
      </Card>
    </div>
  )
}
