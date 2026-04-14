import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Typography, Tabs, Table, Button, Space, Modal, Form, Input, Tag, message, Popconfirm, Switch, Select,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, ArrowLeftOutlined, UserAddOutlined, EditOutlined,
  HolderOutlined, HistoryOutlined, ClearOutlined,
} from '@ant-design/icons'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '@/api/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Locale, ProjectMember, Profile } from '@/types'
import { PROJECT_ROLE_LABELS, PROJECT_ROLE_COLORS, type ProjectRole } from '@/types'

const { Title, Text } = Typography

const SortableRow = ({ activeId, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { activeId?: string; 'data-row-key'?: string }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props['data-row-key']! })
  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: isDragging ? '#f0f5ff' : undefined,
  }
  return <tr ref={setNodeRef} style={style} {...attributes} {...listeners} {...props} />
}

const COMMON_LOCALES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁体中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'fr', name: 'Français' },
  { code: 'it', name: 'Italiano' },
  { code: 'de', name: 'Deutsch' },
  { code: 'es', name: 'Español' },
  { code: 'pt-BR', name: 'Português (BR)' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Bahasa Melayu' },
]

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user, isSuperAdmin } = useAuth()
  const navigate = useNavigate()

  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [logEnabled, setLogEnabled] = useState(true)
  const [locales, setLocales] = useState<Locale[]>([])
  const [members, setMembers] = useState<(ProjectMember & { profile?: Profile })[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState<ProjectRole>('viewer')

  // Locales state
  const [addLocaleOpen, setAddLocaleOpen] = useState(false)
  const [editLocaleOpen, setEditLocaleOpen] = useState(false)
  const [editingLocale, setEditingLocale] = useState<Locale | null>(null)
  const [localeForm] = Form.useForm()

  // Members state
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberForm] = Form.useForm()
  const [memberEmail, setMemberEmail] = useState('')

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase
      .from('projects')
      .select('name, description, log_enabled')
      .eq('id', projectId)
      .single()
    if (data) {
      setProjectName(data.name)
      setProjectDescription(data.description || '')
      setLogEnabled(data.log_enabled ?? true)
    }
  }, [projectId])

  const fetchMyRole = useCallback(async () => {
    if (!user || !projectId) return
    if (isSuperAdmin) {
      setMyRole('admin')
      return
    }
    const { data } = await supabase
      .from('project_member_roles')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .single()
    if (data) setMyRole(data.role as ProjectRole)
  }, [user, projectId, isSuperAdmin])

  const isAdmin = myRole === 'admin' || isSuperAdmin

  const fetchLocales = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase
      .from('locales')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    setLocales(data || [])
  }, [projectId])

  const fetchMembers = useCallback(async () => {
    if (!projectId) return
    const { data } = await supabase
      .from('project_members')
      .select('*, profile:profiles(*)')
      .eq('project_id', projectId)
      .order('created_at')
    setMembers(data || [])
  }, [projectId])

  useEffect(() => {
    Promise.all([fetchProject(), fetchLocales(), fetchMembers(), fetchMyRole()]).then(() => setLoading(false))
  }, [fetchProject, fetchLocales, fetchMembers, fetchMyRole])

  const handleUpdateProject = async () => {
    const { error } = await supabase
      .from('projects')
      .update({ name: projectName, description: projectDescription, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) { message.error('更新失败'); return }
    message.success('项目信息已更新')
  }

  // --- Locales ---
  const handleAddLocale = async (values: { code: string; name: string; isDefault: boolean }) => {
    if (!projectId) return

    const insertData: { project_id: string; code: string; name: string; is_default: boolean; sort_order: number } = {
      project_id: projectId,
      code: values.code,
      name: values.name,
      is_default: values.isDefault || false,
      sort_order: locales.length,
    }

    const { error } = await supabase.from('locales').insert(insertData)
    if (error) { message.error('添加失败: ' + error.message); return }

    if (values.isDefault) {
      await supabase.from('locales')
        .update({ is_default: false })
        .eq('project_id', projectId)
        .neq('code', values.code)
    }

    message.success('语言添加成功')
    setAddLocaleOpen(false)
    localeForm.resetFields()
    fetchLocales()
  }

  const handleDeleteLocale = async (localeId: string) => {
    const { error } = await supabase.from('locales').delete().eq('id', localeId)
    if (error) { message.error('删除失败'); return }
    message.success('语言已删除')
    fetchLocales()
  }

  const openEditLocale = (record: Locale) => {
    setEditingLocale(record)
    localeForm.setFieldsValue({ code: record.code, name: record.name })
    setEditLocaleOpen(true)
  }

  const handleEditLocale = async (values: { code: string; name: string }) => {
    if (!editingLocale) return
    const { error } = await supabase
      .from('locales')
      .update({ code: values.code.trim(), name: values.name.trim() })
      .eq('id', editingLocale.id)
    if (error) { message.error('更新失败: ' + error.message); return }
    message.success('语言已更新')
    setEditLocaleOpen(false)
    setEditingLocale(null)
    localeForm.resetFields()
    fetchLocales()
  }

  const handleToggleDefault = async (localeId: string, checked: boolean) => {
    if (!projectId) return

    if (!checked) {
      const { data } = await supabase
        .from('locales')
        .select('is_default')
        .eq('project_id', projectId)
      const defaultCount = (data || []).filter(l => l.is_default).length
      if (defaultCount <= 1) {
        message.warning('至少需要保留一个默认语言')
        fetchLocales()
        return
      }
      const { error } = await supabase.from('locales').update({ is_default: false }).eq('id', localeId)
      if (error) { message.error('操作失败: ' + error.message); fetchLocales(); return }
    } else {
      const { error: err1 } = await supabase.from('locales').update({ is_default: false }).eq('project_id', projectId)
      if (err1) { message.error('操作失败: ' + err1.message); return }
      const { error: err2 } = await supabase.from('locales').update({ is_default: true }).eq('id', localeId)
      if (err2) { message.error('操作失败: ' + err2.message); return }
    }

    message.success('默认语言已更新')
    await fetchLocales()
  }

  // --- Locale Sort (Drag & Drop) ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )
  const [activeLocaleId, setActiveLocaleId] = useState<string | null>(null)

  const handleLocaleDragStart = (event: DragStartEvent) => {
    setActiveLocaleId(event.active.id as string)
  }

  const handleLocaleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveLocaleId(null)
    if (!over || active.id === over.id) return
    const oldIndex = locales.findIndex(l => l.id === active.id)
    const newIndex = locales.findIndex(l => l.id === over.id)
    const newLocales = arrayMove(locales, oldIndex, newIndex)
    setLocales(newLocales)
    const updates = newLocales.map((l, i) => ({ id: l.id, sort_order: i }))
    await Promise.all(updates.map(u => supabase.from('locales').update({ sort_order: u.sort_order }).eq('id', u.id)))
  }
  const handleSearchUser = async (email: string) => {
    if (!email) return
    const { data } = await supabase.from('profiles').select('*').eq('email', email).single()
    setMemberEmail(email)
    if (data) {
      memberForm.setFieldsValue({ userId: data.id, userName: data.display_name })
    } else {
      memberForm.setFieldsValue({ userId: '', userName: '未找到该用户' })
    }
  }

  const handleAddMember = async (values: { userId: string; role: ProjectRole }) => {
    if (!projectId || !values.userId) return

    const { error } = await supabase
      .from('project_members')
      .insert({ project_id: projectId, user_id: values.userId, role: values.role })

    if (error) { message.error('添加失败: ' + error.message); return }
    message.success('成员添加成功')
    setAddMemberOpen(false)
    memberForm.resetFields()
    fetchMembers()
  }

  const handleChangeRole = async (memberId: string, newRole: ProjectRole) => {
    const { error } = await supabase
      .from('project_members')
      .update({ role: newRole })
      .eq('id', memberId)
    if (error) { message.error('更新失败'); return }
    message.success('角色已更新')
    fetchMembers()
  }

  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (userId === user?.id) {
      message.error('不能移除自己')
      return
    }
    const { error } = await supabase.from('project_members').delete().eq('id', memberId)
    if (error) { message.error('移除失败'); return }
    message.success('成员已移除')
    fetchMembers()
  }

  // --- Log Management (Super Admin Only) ---
  const [logCount, setLogCount] = useState(0)
  const [logLoading, setLogLoading] = useState(false)

  const fetchLogCount = useCallback(async () => {
    if (!projectId) return
    const { count } = await supabase
      .from('translation_history')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    setLogCount(count || 0)
  }, [projectId])

  useEffect(() => {
    if (isSuperAdmin) fetchLogCount()
  }, [isSuperAdmin, fetchLogCount])

  const handleToggleLog = async (checked: boolean) => {
    if (!projectId) return
    const { error } = await supabase
      .from('projects')
      .update({ log_enabled: checked, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) { message.error('更新失败'); return }
    setLogEnabled(checked)
    message.success(checked ? '已开启翻译日志' : '已关闭翻译日志')
  }

  const handleCleanLogs = async (days: number) => {
    if (!projectId) return
    setLogLoading(true)
    const { error } = await supabase
      .from('translation_history')
      .delete()
      .eq('project_id', projectId)
      .lt('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    if (error) { message.error('清理失败'); setLogLoading(false); return }
    message.success(`已清理 ${days} 天前的日志`)
    fetchLogCount()
    setLogLoading(false)
  }

  const handleCleanAllLogs = async () => {
    if (!projectId) return
    Modal.confirm({
      title: '确认清理全部日志？',
      content: `此操作将删除该项目下的所有 ${logCount} 条修改历史记录，不可恢复。`,
      okText: '确认清理',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setLogLoading(true)
        const { error } = await supabase
          .from('translation_history')
          .delete()
          .eq('project_id', projectId)
        if (error) { message.error('清理失败'); setLogLoading(false); return }
        message.success('已清理全部日志')
        setLogCount(0)
        setLogLoading(false)
      },
    })
  }

  const localeColumns = [
    {
      title: '',
      dataIndex: 'sort',
      key: 'sort',
      width: 40,
      render: () => <HolderOutlined style={{ color: '#999', cursor: 'grab' }} />,
    },
    {
      title: '语言代码',
      dataIndex: 'code',
      key: 'code',
      render: (v: string, record: Locale) => (
        <a onClick={() => openEditLocale(record)}><Text code>{v}</Text></a>
      ),
    },
    {
      title: '语言名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record: Locale) => (
        <a onClick={() => openEditLocale(record)}>{v}</a>
      ),
    },
    {
      title: '默认语言',
      dataIndex: 'is_default',
      key: 'is_default',
      width: 100,
      render: (v: boolean, record: Locale) => (
        <Switch checked={v} onChange={(c) => handleToggleDefault(record.id, c)} />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 120,
      render: (_: unknown, record: Locale) => (
        isAdmin ? (
          <Space size="small">
            <Button type="text" icon={<EditOutlined />} size="small" onClick={() => openEditLocale(record)} />
            <Popconfirm title="确认删除？" description="该语言下的所有翻译也将被删除" onConfirm={() => handleDeleteLocale(record.id)}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small" />
            </Popconfirm>
          </Space>
        ) : <Text type="secondary">-</Text>
      ),
    },
  ]

  const memberColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_: unknown, record: ProjectMember & { profile?: Profile }) => (
        <Space>
          <Text strong>{record.profile?.display_name || '未知'}</Text>
          <Text type="secondary">{record.profile?.email}</Text>
          {record.user_id === user?.id && <Tag color="blue">你</Tag>}
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 180,
      render: (role: ProjectRole, record: ProjectMember) => {
        const isSelf = record.user_id === user?.id
        return (
          <Select
            value={role}
            onChange={(v) => handleChangeRole(record.id, v)}
            style={{ width: 140 }}
            disabled={!isAdmin || isSelf}
            options={Object.entries(PROJECT_ROLE_LABELS).map(([k, v]) => ({
              value: k,
              label: <Tag color={PROJECT_ROLE_COLORS[k as ProjectRole]}>{v}</Tag>,
            }))}
          />
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_: unknown, record: ProjectMember) => (
        isAdmin && record.user_id !== user?.id ? (
          <Popconfirm
            title="确认移除该成员？"
            onConfirm={() => handleRemoveMember(record.id, record.user_id)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        ) : <Text type="secondary">-</Text>
      ),
    },
  ]

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <Form layout="vertical" style={{ maxWidth: 500 }}>
          <Form.Item label="项目名称">
            <Input value={projectName} onChange={e => setProjectName(e.target.value)} />
          </Form.Item>
          <Form.Item label="项目描述">
            <Input.TextArea rows={3} value={projectDescription} onChange={e => setProjectDescription(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={handleUpdateProject} disabled={!isAdmin}>保存修改</Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'locales',
      label: `语言管理 (${locales.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            {isAdmin && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddLocaleOpen(true)}>
                添加语言
              </Button>
            )}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={handleLocaleDragStart}
            onDragEnd={handleLocaleDragEnd}
          >
            <SortableContext items={locales.map(l => l.id)} strategy={verticalListSortingStrategy}>
              <Table
                dataSource={locales}
                columns={localeColumns}
                rowKey="id"
                pagination={false}
                size="middle"
                components={{ body: { row: (props: React.HTMLAttributes<HTMLTableRowElement> & { 'data-row-key'?: string }) => <SortableRow activeId={activeLocaleId || undefined} {...props} /> } }}
              />
            </SortableContext>
            <DragOverlay>
              {activeLocaleId && (() => {
                const locale = locales.find(l => l.id === activeLocaleId)
                if (!locale) return null
                return (
                  <div style={{
                    background: '#fff', padding: '12px 16px', borderRadius: 6,
                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)', fontSize: 14,
                    display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap',
                  }}>
                    <HolderOutlined style={{ color: '#999' }} />
                    <Text code>{locale.code}</Text>
                    <Text>{locale.name}</Text>
                    {locale.is_default && <Tag color="blue">默认</Tag>}
                  </div>
                )
              })()}
            </DragOverlay>
          </DndContext>
        </div>
      ),
    },
    {
      key: 'members',
      label: `成员管理 (${members.length})`,
      children: (
        <div>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            {isAdmin && (
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddMemberOpen(true)}>
                添加成员
              </Button>
            )}
          </div>
          <Table dataSource={members} columns={memberColumns} rowKey="id" pagination={false} size="middle" />
        </div>
      ),
    },
    ...(isSuperAdmin ? [{
      key: 'logs',
      label: '日志管理',
      children: (
        <div style={{ maxWidth: 600 }}>
          <div style={{ marginBottom: 24 }}>
            <Space size="large" align="center">
              <Space>
                <HistoryOutlined />
                <Text strong>翻译修改日志</Text>
              </Space>
              <Switch
                checked={logEnabled}
                onChange={handleToggleLog}
                checkedChildren="已开启"
                unCheckedChildren="已关闭"
              />
            </Space>
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">开启后，每次翻译内容的修改将自动记录历史</Text>
            </div>
          </div>

          <div style={{ padding: 16, background: '#fafafa', borderRadius: 8, marginBottom: 24 }}>
            <Space style={{ marginBottom: 12 }}>
              <Text>当前日志记录数：</Text>
              <Tag color="blue">{logCount} 条</Tag>
            </Space>
            <div>
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>按时间范围清理：</Text>
              <Space wrap>
                <Button
                  icon={<ClearOutlined />}
                  loading={logLoading}
                  disabled={!logEnabled || logCount === 0}
                  onClick={() => handleCleanLogs(30)}
                >
                  清理 30 天前
                </Button>
                <Button
                  icon={<ClearOutlined />}
                  loading={logLoading}
                  disabled={!logEnabled || logCount === 0}
                  onClick={() => handleCleanLogs(90)}
                >
                  清理 90 天前
                </Button>
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  loading={logLoading}
                  disabled={logCount === 0}
                  onClick={handleCleanAllLogs}
                >
                  清理全部
                </Button>
              </Space>
            </div>
          </div>
        </div>
      ),
    }] : []),
  ]

  return (
    <div>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/project/${projectId}`)}>
          返回
        </Button>
        <Title level={4} style={{ margin: 0 }}>项目设置</Title>
      </Space>

      <Tabs items={tabItems} />

      {/* Add Locale Modal */}
      <Modal
        title="添加语言"
        open={addLocaleOpen}
        onOk={() => localeForm.submit()}
        onCancel={() => { setAddLocaleOpen(false); localeForm.resetFields() }}
        okText="添加"
        cancelText="取消"
      >
        <Form form={localeForm} layout="vertical" onFinish={handleAddLocale}>
          <Form.Item label="预设语言" style={{ marginBottom: 8 }}>
            <Select
              placeholder="选择预设语言快速填充"
              allowClear
              onChange={(_, option) => {
                const o = option as { code: string; name: string }
                localeForm.setFieldsValue({ code: o.code, name: o.name })
              }}
              options={COMMON_LOCALES.map(l => ({ value: l.code, label: `${l.name} (${l.code})`, code: l.code, name: l.name }))}
            />
          </Form.Item>
          <Form.Item name="code" label="语言代码" rules={[{ required: true, message: '请输入语言代码' }]}>
            <Input placeholder="例如：en, zh-CN, ja" />
          </Form.Item>
          <Form.Item name="name" label="语言名称" rules={[{ required: true, message: '请输入语言名称' }]}>
            <Input placeholder="例如：English, 简体中文" />
          </Form.Item>
          <Form.Item name="isDefault" label="设为默认语言" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Locale Modal */}
      <Modal
        title="编辑语言"
        open={editLocaleOpen}
        onOk={() => localeForm.submit()}
        onCancel={() => { setEditLocaleOpen(false); setEditingLocale(null); localeForm.resetFields() }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={localeForm} layout="vertical" onFinish={handleEditLocale}>
          <Form.Item name="code" label="语言代码" rules={[{ required: true, message: '请输入语言代码' }]}>
            <Input placeholder="例如：en, zh-CN, ja" />
          </Form.Item>
          <Form.Item name="name" label="语言名称" rules={[{ required: true, message: '请输入语言名称' }]}>
            <Input placeholder="例如：English, 简体中文" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        title="添加成员"
        open={addMemberOpen}
        onOk={() => memberForm.submit()}
        onCancel={() => { setAddMemberOpen(false); memberForm.resetFields() }}
        okText="添加"
        cancelText="取消"
      >
        <Form form={memberForm} layout="vertical" onFinish={handleAddMember}>
          <Form.Item label="用户邮箱" required>
            <Input.Search
              placeholder="输入用户邮箱并搜索"
              enterButton="搜索"
              onSearch={handleSearchUser}
            />
          </Form.Item>
          <Form.Item name="userName">
            <Input disabled placeholder="搜索后显示" />
          </Form.Item>
          <Form.Item name="userId" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="viewer" rules={[{ required: true }]}>
            <Select
              options={Object.entries(PROJECT_ROLE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
