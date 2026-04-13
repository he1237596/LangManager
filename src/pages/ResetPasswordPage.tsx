import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message, Result } from 'antd'
import { LockOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { supabase } from '@/api/supabase'

const { Title } = Typography

function getHashParams(): Record<string, string> {
  const hash = window.location.hash.substring(1)
  const params: Record<string, string> = {}
  hash.split('&').forEach(pair => {
    const [key, val] = pair.split('=')
    if (key && val) params[key] = decodeURIComponent(val)
  })
  return params
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [isRecovery, setIsRecovery] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const params = getHashParams()
    if (params.type === 'recovery' && params.access_token) {
      setIsRecovery(true)
      // 用 SDK 验证 recovery token 并恢复 session
      supabase.auth.verifyOtp({
        token_hash: params.access_token,
        type: 'recovery',
      }).then(({ error }) => {
        if (error) setIsRecovery(false)
        setChecking(false)
      })
    } else {
      setChecking(false)
    }
  }, [])

  const onFinish = async (values: { password: string }) => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: values.password })
      if (error) {
        message.error(error.message)
      } else {
        setDone(true)
        window.history.replaceState(null, '', window.location.pathname)
        setTimeout(() => navigate('/login'), 2000)
      }
    } catch {
      message.error('重置密码请求异常')
    }
    setLoading(false)
  }

  if (checking) return null

  if (done) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <Card style={{ width: 420, borderRadius: 12 }} bordered={false}>
          <Result
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title="密码重置成功"
            subTitle="即将跳转到登录页面..."
          />
        </Card>
      </div>
    )
  }

  if (!isRecovery) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <Card style={{ width: 420, borderRadius: 12 }} bordered={false}>
          <Result
            status="warning"
            title="无效的重置链接"
            subTitle="此链接无效或已过期，请重新申请密码重置"
            extra={
              <Button type="primary" onClick={() => navigate('/forgot-password')}>
                重新申请
              </Button>
            }
          />
        </Card>
      </div>
    )
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
          <Title level={2} style={{ marginBottom: 4 }}>重置密码</Title>
        </div>

        <Form onFinish={onFinish} layout="vertical" size="large">
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="新密码（至少6个字符）" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认新密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block style={{ borderRadius: 6 }}>
              重置密码
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
