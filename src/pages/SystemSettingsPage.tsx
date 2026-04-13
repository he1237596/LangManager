import { useEffect, useState, useCallback } from 'react'
import {
  Typography, Table, Card, Tag, Select, Button, Modal, Form, Input, Checkbox,
  message, Space, Divider, Statistic, Row, Col, Popconfirm, Collapse,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, SafetyOutlined, UserOutlined,
  KeyOutlined, UserAddOutlined,
} from '@ant-design/icons'
import { supabase } from '@/api/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile, SystemRole, RolePermissions } from '@/types'
import {
  DEFAULT_PERMISSIONS,
} from '@/types'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { TextArea } = Input

// 权限分类渲染
const PERMISSION_CATEGORIES = [
  {
    key: 'system',
    label: '系统权限',
    permissions: [
      { path: 'manage_users', label: '管理系统用户' },
      { path: 'manage_roles', label: '管理角色和权限' },
    ],
  },
  {
    key: 'project',
    label: '项目权限',
    permissions: [
      { path: 'project.create', label: '创建项目' },
      { path: 'project.delete_any', label: '删除任意项目' },
    ],
  },
  {
    key: 'member',
    label: '成员权限',
    permissions: [
      { path: 'member.invite', label: '邀请成员' },
      { path: 'member.remove', label: '移除成员' },
      { path: 'member.change_role', label: '修改成员角色' },
    ],
  },
]

function getPermValue(permissions: RolePermissions, path: string): boolean {
  const keys = path.split('.')
  let current: unknown = permissions
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return false
    }
  }
  return current === true
}

function setPermValue(permissions: RolePermissions, path: string, value: boolean): RolePermissions {
  const keys = path.split('.')
  const result = JSON.parse(JSON.stringify(permissions)) as RolePermissions
  let current: Record<string, unknown> = result as unknown as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
  return result
}

export default function SystemSettingsPage() {
  const { user, isSuperAdmin, hasPermission } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [roles, setRoles] = useState<SystemRole[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ users: 0, projects: 0, keys: 0 })

  const canManageUsers = isSuperAdmin || hasPermission('manage_users')
  const canManageRoles = isSuperAdmin || hasPermission('manage_roles')

  // Role CRUD state
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<SystemRole | null>(null)
  const [roleForm] = Form.useForm()
  const [tempPermissions, setTempPermissions] = useState<RolePermissions>(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)))

  const fetchUsers = useCallback(async () => {
    if (!canManageUsers) return
    const { data } = await supabase
      .from('profiles')
      .select('*, system_role:roles(*)')
      .order('created_at', { ascending: false })
    setUsers(data || [])
  }, [canManageUsers])

  const fetchRoles = useCallback(async () => {
    const { data } = await supabase
      .from('roles')
      .select('*')
      .order('created_at')
    setRoles(data || [])
  }, [])

  const fetchStats = useCallback(async () => {
    const [usersRes, projectsRes, keysRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('translation_keys').select('id', { count: 'exact', head: true }),
    ])
    setStats({
      users: usersRes.count || 0,
      projects: projectsRes.count || 0,
      keys: keysRes.count || 0,
    })
  }, [])

  useEffect(() => {
    Promise.all([fetchUsers(), fetchRoles(), fetchStats()]).then(() => setLoading(false))
  }, [fetchUsers, fetchRoles, fetchStats])

  // --- Reset User Password ---
  const [resetPwdUser, setResetPwdUser] = useState<Profile | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetPwdLoading, setResetPwdLoading] = useState(false)

  const handleResetPassword = async () => {
    if (!resetPwdUser || !newPassword) return
    if (newPassword.length < 6) {
      message.warning('密码至少6位')
      return
    }
    setResetPwdLoading(true)
    const { error } = await supabase.rpc('reset_user_password', {
      target_user_id: resetPwdUser.id,
      new_password: newPassword,
    })
    setResetPwdLoading(false)
    if (error) {
      message.error('重置失败: ' + error.message)
      return
    }
    message.success(`已重置 ${resetPwdUser.display_name || resetPwdUser.email} 的密码`)
    setResetPwdUser(null)
    setNewPassword('')
  }

  // --- Add User ---
  const [addUserModalOpen, setAddUserModalOpen] = useState(false)
  const [addUserForm] = Form.useForm()
  const [addUserLoading, setAddUserLoading] = useState(false)

  const handleAddUser = async (values: { email: string; password: string; display_name: string; role_name: string }) => {
    if (!isSuperAdmin) return
    setAddUserLoading(true)
    const { data, error } = await supabase.rpc('create_user', {
      p_email: values.email,
      p_password: values.password,
      p_display_name: values.display_name || null,
      p_role_name: values.role_name || 'user',
    })
    setAddUserLoading(false)
    if (error) {
      message.error('创建失败: ' + error.message)
      return
    }
    if (data?.error) {
      message.error('创建失败: ' + data.error)
      return
    }
    message.success(`用户 ${values.display_name || values.email} 创建成功`)
    setAddUserModalOpen(false)
    addUserForm.resetFields()
    fetchUsers()
    fetchStats()
  }

  // --- User Role Assignment ---
  const handleChangeRole = async (userId: string, newRoleId: string) => {
    if (!canManageUsers) return
    if (userId === user?.id) {
      message.warning('不能修改自己的角色')
      return
    }
    // 非超级管理员不能将别人设为超级管理员
    if (!isSuperAdmin) {
      const targetRole = roles.find(r => r.id === newRoleId)
      if (targetRole?.name === 'super_admin') {
        message.warning('仅超级管理员可将用户设为超级管理员')
        return
      }
    }
    const { error } = await supabase
      .from('profiles')
      .update({ role_id: newRoleId, updated_at: new Date().toISOString() })
      .eq('id', userId)
    if (error) { message.error('更新失败: ' + error.message); return }
    message.success('角色已更新')
    fetchUsers()
  }

  // --- Role CRUD ---
  const openCreateRole = () => {
    setEditingRole(null)
    roleForm.resetFields()
    setTempPermissions(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS)))
    setRoleModalOpen(true)
  }

  const openEditRole = (role: SystemRole) => {
    setEditingRole(role)
    roleForm.setFieldsValue({ name: role.name, display_name: role.display_name, description: role.description })
    setTempPermissions(JSON.parse(JSON.stringify(role.permissions)))
    setRoleModalOpen(true)
  }

  const handleSaveRole = async (values: { name: string; display_name: string; description?: string }) => {
    if (editingRole) {
      // Update
      const { error } = await supabase
        .from('roles')
        .update({
          name: values.name,
          display_name: values.display_name,
          description: values.description || null,
          permissions: tempPermissions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingRole.id)
      if (error) { message.error('更新失败: ' + error.message); return }
      message.success('角色已更新')
    } else {
      // Create
      const { error } = await supabase
        .from('roles')
        .insert({
          name: values.name,
          display_name: values.display_name,
          description: values.description || null,
          permissions: tempPermissions,
        })
      if (error) { message.error('创建失败: ' + error.message); return }
      message.success('角色已创建')
    }
    setRoleModalOpen(false)
    setEditingRole(null)
    fetchRoles()
  }

  const handleDeleteRole = async (roleId: string) => {
    // Check if any user has this role
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId)
    if (count && count > 0) {
      message.error('该角色下还有用户，无法删除。请先将用户分配到其他角色。')
      return
    }
    const { error } = await supabase.from('roles').delete().eq('id', roleId)
    if (error) { message.error('删除失败: ' + error.message); return }
    message.success('角色已删除')
    fetchRoles()
  }

  // --- Table Columns ---
  const userColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_: unknown, record: Profile) => (
        <Space>
          <UserOutlined />
          <Text strong>{record.display_name || '未设置'}</Text>
          {record.id === user?.id && <Tag color="blue">你</Tag>}
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (v: string) => v || '-',
    },
    {
      title: '系统角色',
      key: 'role',
      width: 220,
      render: (_: unknown, record: Profile) => {
        const isSelf = record.id === user?.id
        return (
          <Select
            value={record.role_id}
            onChange={(v) => handleChangeRole(record.id, v)}
            style={{ width: 180 }}
            disabled={!canManageUsers || isSelf}
            options={roles.map(r => ({
              value: r.id,
              disabled: !isSuperAdmin && r.name === 'super_admin',
              label: <Tag color={r.name === 'super_admin' ? 'red' : r.name === 'sys_admin' ? 'orange' : r.name === 'operator' ? 'blue' : 'default'}>{r.display_name}</Tag>,
            }))}
          />
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: Profile) => (
        <Space size={4}>
          {isSuperAdmin && record.id !== user?.id && (
            <Button
              type="text"
              icon={<KeyOutlined />}
              size="small"
              onClick={() => { setResetPwdUser(record); setNewPassword('') }}
            />
          )}
        </Space>
      ),
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
  ]

  const roleColumns = [
    {
      title: '角色名称',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (v: string, record: SystemRole) => (
        <Space>
          <SafetyOutlined />
          <Text strong>{v}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>({record.name})</Text>
          {record.is_system && <Tag color="purple">系统</Tag>}
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (v: string) => v || '-',
    },
    {
      title: '权限摘要',
      key: 'perm_summary',
      width: 300,
      render: (_: unknown, record: SystemRole) => {
        const perms = record.permissions
        const active: string[] = []
        if (perms.manage_users) active.push('用户管理')
        if (perms.manage_roles) active.push('角色管理')
        if (perms.project.create) active.push('创建项目')
        if (perms.project.delete_any) active.push('删除项目')
        if (perms.member.invite) active.push('邀请成员')
        if (perms.member.change_role) active.push('修改角色')
        return (
          <Space wrap size={4}>
            {active.length > 0
              ? active.map(p => <Tag key={p} color="blue" style={{ fontSize: 11 }}>{p}</Tag>)
              : <Text type="secondary">无特殊权限</Text>
            }
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: SystemRole) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEditRole(record)}
            disabled={!canManageRoles}
          />
          {!record.is_system && (
            <Popconfirm
              title="确认删除此角色？"
              onConfirm={() => handleDeleteRole(record.id)}
              okText="删除"
              cancelText="取消"
            >
              <Button type="text" danger icon={<DeleteOutlined />} size="small" disabled={!canManageRoles} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  // --- Permission Checkbox Renderer ---
  const renderPermissionCategory = (category: typeof PERMISSION_CATEGORIES[0]) => (
    <div key={category.key} style={{ marginBottom: category.key === 'member' ? 0 : 16 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>{category.label}</Text>
      <Checkbox.Group
        value={category.permissions.filter(p => getPermValue(tempPermissions, p.path)).map(p => p.path)}
        onChange={(checkedValues) => {
          let newPerms = JSON.parse(JSON.stringify(tempPermissions)) as RolePermissions
          for (const p of category.permissions) {
            const isActive = (checkedValues as string[]).includes(p.path)
            // Handle top-level boolean permissions
            if (!p.path.includes('.')) {
              ;(newPerms as unknown as Record<string, unknown>)[p.path] = isActive
            } else {
              newPerms = setPermValue(newPerms, p.path, isActive)
            }
          }
          setTempPermissions(newPerms)
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
      >
        {category.permissions.map(p => (
          <Checkbox key={p.path} value={p.path} style={{ marginLeft: 8 }}>
            {p.label}
          </Checkbox>
        ))}
      </Checkbox.Group>
    </div>
  )

  // --- Permission View Modal ---
  const [viewPermsRole, setViewPermsRole] = useState<SystemRole | null>(null)

  if (!canManageUsers && !canManageRoles) {
    return (
      <Card>
        <Title level={4}>系统设置</Title>
        <Text type="secondary">您没有权限访问此页面。</Text>
      </Card>
    )
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>系统设置</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <Statistic title="用户总数" value={stats.users} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="项目总数" value={stats.projects} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="翻译 Key 总数" value={stats.keys} />
          </Card>
        </Col>
      </Row>

      {/* 角色管理 */}
      {canManageRoles && (
        <>
          <Divider>角色管理</Divider>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text type="secondary">管理系统角色和权限。系统角色不可删除。</Text>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateRole}>
              新增角色
            </Button>
          </div>
          <Table
            dataSource={roles}
            columns={roleColumns}
            rowKey="id"
            loading={loading}
            pagination={false}
            size="middle"
            onRow={(record) => ({
              onDoubleClick: () => setViewPermsRole(record),
              style: { cursor: 'pointer' },
            })}
          />
        </>
      )}

      {/* 用户管理 */}
      {canManageUsers && (
        <>
          <Divider style={{ marginTop: 32 }}>用户管理</Divider>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text type="secondary">为用户分配系统角色。双击角色可查看权限详情。</Text>
            {isSuperAdmin && (
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => { addUserForm.resetFields(); setAddUserModalOpen(true) }}>
                添加用户
              </Button>
            )}
          </div>
          <Table
            dataSource={users}
            columns={userColumns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 位用户` }}
            size="middle"
          />
        </>
      )}

      {/* 新增/编辑角色弹窗 */}
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={roleModalOpen}
        onCancel={() => { setRoleModalOpen(false); setEditingRole(null) }}
        width={560}
        footer={null}
        destroyOnClose
      >
        <Form
          form={roleForm}
          layout="vertical"
          onFinish={handleSaveRole}
        >
          <Form.Item
            name="name"
            label="角色标识（英文）"
            rules={[
              { required: true, message: '请输入角色标识' },
              { pattern: /^[a-z][a-z0-9_]*$/, message: '只能包含小写字母、数字、下划线，且以字母开头' },
            ]}
          >
            <Input placeholder="例如：content_manager" disabled={editingRole?.is_system} />
          </Form.Item>
          <Form.Item
            name="display_name"
            label="角色显示名称"
            rules={[{ required: true, message: '请输入显示名称' }]}
          >
            <Input placeholder="例如：内容管理员" />
          </Form.Item>
          <Form.Item name="description" label="角色描述">
            <TextArea rows={2} placeholder="简要描述该角色的用途" />
          </Form.Item>

          <Divider style={{ margin: '16px 0 12px' }}>权限配置</Divider>
          {PERMISSION_CATEGORIES.map(renderPermissionCategory)}

          <Form.Item style={{ marginTop: 16, marginBottom: 0, textAlign: 'right' }}>
            <Button style={{ marginRight: 8 }} onClick={() => { setRoleModalOpen(false); setEditingRole(null) }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              {editingRole ? '保存修改' : '创建角色'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码弹窗 */}
      <Modal
        title={<span><KeyOutlined /> 重置用户密码</span>}
        open={!!resetPwdUser}
        onCancel={() => { setResetPwdUser(null); setNewPassword('') }}
        onOk={handleResetPassword}
        okText="确认重置"
        cancelText="取消"
        okButtonProps={{ danger: true, loading: resetPwdLoading }}
        confirmLoading={resetPwdLoading}
      >
        {resetPwdUser && (
          <div style={{ marginTop: 16 }}>
            <Text>
              将为用户 <Text strong>{resetPwdUser.display_name || '未设置'}</Text>
              {resetPwdUser.email && <Text type="secondary"> ({resetPwdUser.email})</Text>}
              设置新密码：
            </Text>
            <Input.Password
              style={{ marginTop: 12 }}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="请输入新密码（至少6位）"
              onPressEnter={handleResetPassword}
            />
            <Text type="warning" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              此操作将立即生效，请务必通知用户新密码。
            </Text>
          </div>
        )}
      </Modal>

      {/* 添加用户弹窗 */}
      <Modal
        title={<span><UserAddOutlined /> 添加用户</span>}
        open={addUserModalOpen}
        onCancel={() => setAddUserModalOpen(false)}
        footer={null}
        destroyOnClose
        width={480}
      >
        <Form
          form={addUserForm}
          layout="vertical"
          onFinish={handleAddUser}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="display_name"
            label="昵称"
          >
            <Input placeholder="可选，不填则使用邮箱前缀" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱地址" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="请输入密码（至少6位）" />
          </Form.Item>
          <Form.Item
            name="role_name"
            label="系统角色"
            initialValue="user"
          >
            <Select
              options={roles.map(r => {
                // 非超级管理员不能创建超级管理员
                if (!isSuperAdmin && r.name === 'super_admin') return { value: r.name, label: '', disabled: true } as { value: string; label: string; disabled: boolean }
                return {
                  value: r.name,
                  label: <Tag color={r.name === 'super_admin' ? 'red' : r.name === 'sys_admin' ? 'orange' : r.name === 'operator' ? 'blue' : 'default'}>{r.display_name}</Tag>,
                }
              }).filter(r => isSuperAdmin || !roles.find(role => role.name === 'super_admin') || r.value !== roles.find(role => role.name === 'super_admin')?.name || isSuperAdmin)}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Button style={{ marginRight: 8 }} onClick={() => setAddUserModalOpen(false)}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={addUserLoading}>
              创建用户
            </Button>
          </Form.Item>
          <Text type="warning" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            创建后用户可直接使用邮箱和密码登录，无需邮箱验证。
          </Text>
        </Form>
      </Modal>

      {/* 查看权限详情弹窗 */}
      <Modal
        title={viewPermsRole ? `${viewPermsRole.display_name} - 权限详情` : '权限详情'}
        open={!!viewPermsRole}
        onCancel={() => setViewPermsRole(null)}
        footer={<Button onClick={() => setViewPermsRole(null)}>关闭</Button>}
      >
        {viewPermsRole && (
          <Collapse
            defaultActiveKey={PERMISSION_CATEGORIES.map(c => c.key)}
            items={PERMISSION_CATEGORIES.map(cat => ({
              key: cat.key,
              label: cat.label,
              children: (
                <Space direction="vertical" style={{ width: '100%' }}>
                  {cat.permissions.map(p => (
                    <div key={p.path} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                      <Text>{p.label}</Text>
                      <Tag color={getPermValue(viewPermsRole.permissions, p.path) ? 'green' : 'default'}>
                        {getPermValue(viewPermsRole.permissions, p.path) ? '允许' : '禁止'}
                      </Tag>
                    </div>
                  ))}
                </Space>
              ),
            }))}
          />
        )}
      </Modal>
    </div>
  )
}
