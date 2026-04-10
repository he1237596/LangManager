import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, List, Typography, Modal, Form, Input, Space, Empty, Tag, message, Popconfirm,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ProjectOutlined, SettingOutlined,
} from '@ant-design/icons'
import { supabase } from '@/api/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Project } from '@/types'
import { PROJECT_ROLE_LABELS, PROJECT_ROLE_COLORS } from '@/types'
import dayjs from 'dayjs'

const { Text, Title } = Typography
const { TextArea } = Input

export default function ProjectListPage() {
  const { user, isSuperAdmin, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [form] = Form.useForm()

  const fetchProjects = async () => {
    setLoading(true)

    if (isSuperAdmin) {
      // super_admin 直接查看所有项目
      const { data: projectsData } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      // 查询自己在各项目中的角色（可选）
      const { data: memberData } = await supabase
        .from('project_member_roles')
        .select('project_id, role')
        .eq('user_id', user!.id)

      const memberMap = new Map((memberData || []).map(d => [d.project_id, d.role]))

      const merged = (projectsData || []).map((p) => ({
        ...p,
        member_role: memberMap.get(p.id) || 'admin',
      }))
      setProjects(merged)
    } else {
      const { data } = await supabase
        .from('project_member_roles')
        .select('project_id, role')
        .eq('user_id', user!.id)

      if (data && data.length > 0) {
        const projectIds = data.map((d) => d.project_id)
        const { data: projectsData } = await supabase
          .from('projects')
          .select('*')
          .in('id', projectIds)
          .order('updated_at', { ascending: false })

        const merged = (projectsData || []).map((p) => ({
          ...p,
          member_role: data.find((d) => d.project_id === p.id)?.role,
        }))
        setProjects(merged)
      } else {
        setProjects([])
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
  }, [user])

  const handleCreate = async (values: { name: string; description?: string }) => {
    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        name: values.name,
        description: values.description || null,
        created_by: user!.id,
      })
      .select()
      .single()

    if (error) {
      message.error('创建失败: ' + error.message)
      return
    }

    await supabase
      .from('project_members')
      .insert({
        project_id: project.id,
        user_id: user!.id,
        role: 'admin',
      })

    message.success('项目创建成功')
    setModalOpen(false)
    form.resetFields()
    fetchProjects()
  }

  const handleUpdate = async (values: { name: string; description?: string }) => {
    if (!editingProject) return
    const { error } = await supabase
      .from('projects')
      .update({
        name: values.name,
        description: values.description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingProject.id)

    if (error) {
      message.error('更新失败: ' + error.message)
      return
    }
    message.success('项目更新成功')
    setModalOpen(false)
    setEditingProject(null)
    form.resetFields()
    fetchProjects()
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      message.error('删除失败: ' + error.message)
      return
    }
    message.success('项目已删除')
    fetchProjects()
  }

  const openCreateModal = () => {
    setEditingProject(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (project: Project) => {
    setEditingProject(project)
    form.setFieldsValue({ name: project.name, description: project.description })
    setModalOpen(true)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0 }}>我的项目</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal} style={{ display: (isSuperAdmin || hasPermission('project.create')) ? undefined : 'none' }}>
          新建项目
        </Button>
      </div>

      {projects.length === 0 && !loading ? (
        <Empty description="暂无项目，点击上方按钮创建第一个项目" />
      ) : (
        <List
          loading={loading}
          grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
          dataSource={projects}
          renderItem={(project) => (
            <List.Item>
              <Card
                hoverable
                style={{ height: '100%' }}
                actions={[
                  ...(project.member_role === 'admin' || isSuperAdmin ? [
                    <SettingOutlined
                      key="settings"
                      onClick={(e) => { e.stopPropagation(); navigate(`/project/${project.id}/settings`) }}
                    />,
                  ] : []),
                  ...(project.member_role === 'admin' || isSuperAdmin ? [
                    <EditOutlined key="edit" onClick={(e) => { e.stopPropagation(); openEditModal(project) }} />,
                    <Popconfirm
                      key="delete"
                      title="确认删除此项目？"
                      description="删除后数据无法恢复"
                      onConfirm={(e) => { e?.stopPropagation(); handleDelete(project.id) }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <DeleteOutlined onClick={(e) => e.stopPropagation()} />
                    </Popconfirm>,
                  ] : []),
                ]}
                onClick={() => navigate(`/project/${project.id}`)}
              >
                <Card.Meta
                  avatar={<ProjectOutlined style={{ fontSize: 28, color: '#6366f1' }} />}
                  title={
                    <Space>
                      {project.name}
                      <Tag color={PROJECT_ROLE_COLORS[project.member_role!]}>
                        {PROJECT_ROLE_LABELS[project.member_role!]}
                      </Tag>
                    </Space>
                  }
                  description={
                    <>
                      {project.description || '暂无描述'}
                      <br />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        更新于 {dayjs(project.updated_at).format('YYYY-MM-DD HH:mm')}
                      </Text>
                    </>
                  }
                />
              </Card>
            </List.Item>
          )}
        />
      )}

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={modalOpen}
        onOk={() => form.submit()}
        onCancel={() => { setModalOpen(false); setEditingProject(null); form.resetFields() }}
        okText={editingProject ? '保存' : '创建'}
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingProject ? handleUpdate : handleCreate}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：My App" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <TextArea rows={3} placeholder="简要描述项目用途" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
