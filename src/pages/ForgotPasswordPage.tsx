import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, message, Space } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { useAuth } from '@/contexts/AuthContext'

const { Title, Text } = Typography

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth()
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const onFinish = async (values: { email: string }) => {
    setLoading(true)
    const { error } = await resetPassword(values.email)
    setLoading(false)
    if (error) {
      message.error(error)
    } else {
      setSent(true)
      message.success('重置链接已发送到您的邮箱')
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
          <Title level={2} style={{ marginBottom: 4 }}>忘记密码</Title>
          <Text type="secondary">
            {sent ? '重置链接已发送' : '输入邮箱地址以接收重置链接'}
          </Text>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <Text>请检查您的邮箱，点击重置链接来设置新密码。</Text>
            <div style={{ marginTop: 24 }}>
              <Space>
                <Link to="/login">返回登录</Link>
                <Button type="link" onClick={() => setSent(false)}>重新发送</Button>
              </Space>
            </div>
          </div>
        ) : (
          <>
            <Form
              name="forgot-password"
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

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={{ borderRadius: 6 }}
                >
                  发送重置链接
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center' }}>
              <Link to="/login">返回登录</Link>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
