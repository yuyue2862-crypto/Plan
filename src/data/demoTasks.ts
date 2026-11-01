import { dateKey, type Task } from "../domain/tasks";

function day(offset: number): string {
  const today = new Date();
  return dateKey(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset),
  );
}

// Isolated demo data. It is re-created on page reload and never loaded from user storage.
export function loadDemoTasks(): Task[] {
  return [
    {
      id: "d1",
      title: "梳理下周工作重点",
      quadrant: "q2",
      createdDate: day(-2),
      due: day(2),
      pinned: true,
    },
    {
      id: "d2",
      title: "阅读行业报告并整理笔记",
      quadrant: "q2",
      createdDate: day(-5),
      due: day(-1),
      lockedNotUrgent: true,
    },
    {
      id: "d3",
      title: "规划本月学习安排",
      quadrant: "q2",
      createdDate: day(0),
      due: day(12),
    },
    {
      id: "d4",
      title: "提交项目阶段总结",
      quadrant: "q1",
      createdDate: day(-3),
      due: `${day(0)}T18:00`,
      pinned: true,
    },
    {
      id: "d5",
      title: "确认明日会议材料",
      quadrant: "q1",
      createdDate: day(-1),
      due: day(-2),
    },
    {
      id: "d6",
      title: "回复重要合作邮件",
      quadrant: "q1",
      createdDate: day(0),
      due: day(0),
    },
    { id: "d7", title: "整理下载文件夹", quadrant: "q4", createdDate: day(0) },
    {
      id: "d8",
      title: "归档旧的参考资料",
      quadrant: "q4",
      createdDate: day(-8),
      due: day(24),
    },
    {
      id: "d9",
      title: "回复普通咨询消息",
      quadrant: "q3",
      createdDate: day(-1),
      due: day(0),
    },
    {
      id: "d10",
      title: "确认快递收件时间",
      quadrant: "q3",
      createdDate: day(0),
      due: day(1),
    },
    {
      id: "d11",
      title: "整理待分类的生活事项",
      quadrant: "inbox",
      createdDate: day(-4),
      due: day(-1),
    },
    {
      id: "d12",
      title: "复盘已完成的周计划",
      quadrant: "q2",
      createdDate: day(-6),
      due: day(-3),
      completedAt: `${day(-2)}T16:00:00`,
    },
  ];
}
