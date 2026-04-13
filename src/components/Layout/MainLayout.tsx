import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Typography, Spin, Modal, Form, Input, Tabs, message } from 'antd'
import {
  ProjectOutlined,
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  GlobalOutlined,
  EditOutlined,
  LockOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/contexts/AuthContext'
import type { MenuProps } from 'antd'

const { Header, Sider, Content } = Layout
const { Text } = Typography

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, profile, signOut, isSuperAdmin, hasPermission, updateProfile, changePassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileForm] = Form.useForm()
  const [passwordForm] = Form.useForm()

  const showSystemSettings = isSuperAdmin || hasPermission('manage_users') || hasPermission('manage_roles')

  const menuItems: MenuProps['items'] = [
    {
      key: '/',
      icon: <ProjectOutlined />,
      label: '项目管理',
    },
    ...(showSystemSettings ? [{
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    }] : []),
  ]

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: (
        <span>
          <Text strong>{profile?.display_name || '未设置昵称'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{user?.email}</Text>
        </span>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'edit-profile',
      icon: <EditOutlined />,
      label: '个人设置',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
    },
  ]

  const onMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  const onUserMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'logout') {
      signOut()
      navigate('/login')
    } else if (key === 'edit-profile') {
      profileForm.setFieldsValue({ display_name: profile?.display_name || '' })
      passwordForm.resetFields()
      setProfileOpen(true)
    }
  }

  const selectedKey = location.pathname.startsWith('/project/')
    ? '/'
    : location.pathname

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 10,
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <GlobalOutlined style={{ fontSize: 24, color: '#fff' }} />
          {!collapsed && (
            <Text strong style={{ color: '#fff', marginLeft: 10, fontSize: 16 }}>
              LangManager
            </Text>
          )}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={onMenuClick}
        />
      </Sider>
      <Layout style={{ marginLeft: collapsed ? 80 : 200, transition: 'margin-left 0.2s' }}>
        <Header style={{
          padding: '0 24px',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          position: 'sticky',
          top: 0,
          zIndex: 9,
        }}>
          <div
            style={{ cursor: 'pointer', fontSize: 18 }}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          <Dropdown
            menu={{ items: userMenuItems, onClick: onUserMenuClick }}
            placement="bottomRight"
          >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar size="small" icon={<UserOutlined />} src={profile?.avatar_url} />
              <Text>{profile?.display_name || '用户'}</Text>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>

      {/* 个人设置弹窗 */}
      <Modal
        title="个人设置"
        open={profileOpen}
        onCancel={() => setProfileOpen(false)}
        footer={null}
        width={460}
        destroyOnClose
      >
        <Tabs
          items={[
            {
              key: 'info',
              label: <span><UserOutlined /> 基本信息</span>,
              children: (
                <Form form={profileForm} layout="vertical" onFinish={async (values) => {
                  setProfileLoading(true)
                  try {
                    await updateProfile({ display_name: values.display_name || null })
                    message.success('昵称已更新')
                    setProfileOpen(false)
                  } catch {
                    message.error('更新失败')
                  } finally {
                    setProfileLoading(false)
                  }
                }}>
                  <Form.Item name="display_name" label="昵称">
                    <Input placeholder="设置你的昵称" maxLength={50} />
                  </Form.Item>
                  <Form.Item label="邮箱">
                    <Input value={user?.email} disabled />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      style={{ marginRight: 8, padding: '4px 15px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                    >取消</button>
                    <button
                      type="submit"
                      disabled={profileLoading}
                      style={{ padding: '4px 15px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: 'pointer' }}
                    >保存</button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'password',
              label: <span><LockOutlined /> 修改密码</span>,
              children: (
                <Form form={passwordForm} layout="vertical" onFinish={async (values) => {
                  setProfileLoading(true)
                  try {
                    const { error } = await changePassword(values.new_password)
                    if (error) {
                      message.error(error)
                      return
                    }
                    message.success('密码已修改，下次登录时生效')
                    passwordForm.resetFields()
                    setProfileOpen(false)
                  } finally {
                    setProfileLoading(false)
                  }
                }}>
                  <Form.Item
                    name="new_password"
                    label="新密码"
                    rules={[
                      { required: true, message: '请输入新密码' },
                      { min: 6, message: '密码至少 6 个字符' },
                    ]}
                  >
                    <Input.Password placeholder="输入新密码" />
                  </Form.Item>
                  <Form.Item
                    name="confirm_password"
                    label="确认密码"
                    dependencies={['new_password']}
                    rules={[
                      { required: true, message: '请确认新密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                          return Promise.reject(new Error('两次输入的密码不一致'))
                        },
                      }),
                    ]}
                  >
                    <Input.Password placeholder="再次输入新密码" />
                  </Form.Item>
                  <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => setProfileOpen(false)}
                      style={{ marginRight: 8, padding: '4px 15px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer' }}
                    >取消</button>
                    <button
                      type="submit"
                      disabled={profileLoading}
                      style={{ padding: '4px 15px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: 'pointer' }}
                    >修改密码</button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </Layout>
  )
}
