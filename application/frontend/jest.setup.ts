import "@testing-library/jest-dom";

// recharts の ResponsiveContainer / ChartContainer が使用する ResizeObserver を jsdom 環境に追加
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
