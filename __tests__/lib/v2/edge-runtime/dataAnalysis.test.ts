import {
  checkCodeExecutionOutput,
  convertToGraphData,
  ensureXandYinData,
  formatPlotData,
} from "../../../../lib/v2/edge-runtime/dataAnalysis";
import { ExecuteCode2Item } from "../../../../lib/types";
import { dataAnalysisActionName } from "../../../../lib/v2/builtinActions";
import { stripBasicTypescriptTypes } from "../../../../lib/v2/prompts/dataAnalysis";

describe("convertToGraphData", () => {
  const logMess1 = {
    type: "log",
    args: { message: "log message 1" },
  } as Extract<ExecuteCode2Item, { type: "log" }>;
  it("3x logMess1", () => {
    const out = convertToGraphData([logMess1, logMess1, logMess1]);
    expect(out).toStrictEqual([
      {
        role: "function",
        name: dataAnalysisActionName,
        content: `Logs from code execution and API calls for ${dataAnalysisActionName}:
log message 1
log message 1
log message 1`,
      },
    ]);
  });
  const plotMess1: Extract<ExecuteCode2Item, { type: "plot" }> = {
    type: "plot",
    args: {
      title: "plot 1",
      type: "line",
      data: [{ x: 1, y: 2 }],
      labels: { x: "x", y: "y" },
    },
  };
  // Include a plot
  it("1x plotMess1, 2x logMess1", () => {
    const out = convertToGraphData([logMess1, plotMess1, logMess1]);
    expect(out).toStrictEqual([
      {
        role: "function",
        name: dataAnalysisActionName,
        content: `Logs from code execution and API calls for ${dataAnalysisActionName}:
log message 1
log message 1`,
      },
      {
        role: "graph",
        content: {
          graphTitle: "plot 1",
          type: "value", // Converts to value
          data: [{ x: 1, y: 2 }],
          xLabel: "x",
          yLabel: "y",
        },
      },
    ]);
  });
  const plotMess2: Extract<ExecuteCode2Item, { type: "plot" }> = {
    type: "plot",
    args: {
      title: "plot 2",
      type: "line",
      data: [{ x: 3, y: 4 }],
      labels: { x: "x", y: "y" },
    },
  };
  // Combine plots into 1 plot
  it("2x plotMess1, 2x logMess1", () => {
    const out = convertToGraphData(
      JSON.parse(JSON.stringify([logMess1, plotMess1, plotMess1, logMess1])),
    );
    expect(out).toStrictEqual([
      {
        role: "function",
        name: dataAnalysisActionName,
        content: `Logs from code execution and API calls for ${dataAnalysisActionName}:
log message 1
log message 1`,
      },
      {
        role: "graph",
        content: {
          graphTitle: "plot 1",
          type: "line",
          data: [
            { x: 1, y: 2 },
            { x: 1, y: 2 },
          ],
          xLabel: "x",
          yLabel: "y",
        },
      },
    ]);
  });
  it("3x plotMess1, 2x plotMess2, 2x logMess1", () => {
    const out = convertToGraphData(
      JSON.parse(
        JSON.stringify([
          logMess1,
          plotMess1,
          plotMess2,
          plotMess1,
          plotMess2,
          plotMess1,
        ]),
      ),
    );
    expect(out).toStrictEqual([
      {
        role: "function",
        name: dataAnalysisActionName,
        content: `Logs from code execution and API calls for ${dataAnalysisActionName}:
log message 1`,
      },
      {
        role: "graph",
        content: {
          graphTitle: "plot 1",
          type: "line",
          data: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
            { x: 1, y: 2 },
            { x: 3, y: 4 },
            { x: 1, y: 2 },
          ],
          xLabel: "x",
          yLabel: "y",
        },
      },
    ]);
  });
  // Check the automated message about code running is added
  it("1x plotMess1", () => {
    const out = convertToGraphData([plotMess1]);
    expect(out).toStrictEqual([
      {
        role: "function",
        name: dataAnalysisActionName,
        content: `Logs from code execution and API calls for ${dataAnalysisActionName}:

Plot generated successfully`,
      },
      {
        role: "graph",
        content: {
          graphTitle: "plot 1",
          type: "value",
          data: [{ x: 1, y: 2 }],
          xLabel: "x",
          yLabel: "y",
        },
      },
    ]);
  });
});

describe("ensureDataWellFormatted", () => {
  it("x and y present: do nothing", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        labels: { x: "date", y: "value" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "date",
        yLabel: "value",
      },
    });
  });
  it("x missing, get from labels", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { date: 1, y: 2 },

          { date: 1, y: 2 },
        ],
        labels: { x: "date", y: "value" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "date",
        yLabel: "value",
      },
    });
  });
  it("x missing, get from labels (lowercase)", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { date: 1, y: 2 },

          { date: 1, y: 2 },
        ],
        labels: { x: "Date", y: "value" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Date",
        yLabel: "value",
      },
    });
  });
  it("y missing, get from labels", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: 1, value: 2 },
          { x: 1, value: 2 },
        ],
        labels: { x: "date", y: "value" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "date",
        yLabel: "value",
      },
    });
  });
  it("y missing, get from labels, remove units", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: 1, age: 23, value: 2 },
          { x: 1, age: 23, value: 2 },
        ],
        labels: { x: "Date", y: "Value ($)" },
      },
    });
    expect(out).toEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2, age: 23 },
          { x: 1, y: 2, age: 23 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Date",
        yLabel: "Value ($)",
      },
    });
  });
  it("y missing, get from order", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: 1, value: 2 },
          { x: 1, value: 2 },
        ],
        labels: { x: "Date", y: "Units ($)" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Date",
        yLabel: "Units ($)",
      },
    });
  });
  it("y missing, get from labels, out of order", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { value: 2, x: 1 },
          { value: 2, x: 1 },
        ],
        labels: { x: "Date", y: "Value ($)" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Date",
        yLabel: "Value ($)",
      },
    });
  });
  it("x & y missing, get from labels", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { value: 2, date: 1 },
          { value: 2, date: 1 },
        ],
        labels: { x: "Date", y: "Value ($)" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Date",
        yLabel: "Value ($)",
      },
    });
  });
  it("x & y missing, get from order", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { date: 1, value: 2 },
          { date: 1, value: 2 },
        ],
        labels: { x: "Mornings", y: "Units ($)" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { x: 1, y: 2 },
          { x: 1, y: 2 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "Mornings",
        yLabel: "Units ($)",
      },
    });
  });
  it("Real world: x & y missing, get one from label, one from order", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { rep: "Emma", wonDeals: 14, closedDeals: 0 },
          { rep: "Ava", wonDeals: 12, closedDeals: 0 },
        ],
        labels: { x: "rep", y: "deals" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { closedDeals: 0, x: "Emma", y: 14 },
          { closedDeals: 0, x: "Ava", y: 12 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "rep",
        yLabel: "deals",
      },
    });
  });
  it("Real world: x & y missing, get one from label, one from order", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { rep: "Emma", wonDeals: 14, closedDeals: 0 },
          { rep: "Ava", wonDeals: 12, closedDeals: 0 },
        ],
        labels: { x: "rep", y: "deals" },
      },
    });
    expect(out).toStrictEqual({
      role: "graph",
      content: {
        data: [
          { closedDeals: 0, x: "Emma", y: 14 },
          { closedDeals: 0, x: "Ava", y: 12 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "rep",
        yLabel: "deals",
      },
    });
  });
  it("Real world: y is an object", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: "Emma", y: { wonDeals: 14, closedDeals: 0 } },
          { x: "Ava", y: { wonDeals: 12, closedDeals: 0 } },
        ],
        labels: { x: "rep", y: "deals" },
      },
    });
    expect(out).toEqual({
      role: "graph",
      content: {
        data: [
          { closedDeals: 0, x: "Emma", y: 14 },
          { closedDeals: 0, x: "Ava", y: 12 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "rep",
        yLabel: "deals",
      },
    });
  });
  it("Real world: y is an object in later datapoints, not first", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          { x: "Emma", y: 14 },
          { x: "Ava", y: { wonDeals: 12, closedDeals: 0 } },
        ],
        labels: { x: "rep", y: "deals" },
      },
    });
    expect(out).toEqual({
      role: "graph",
      content: {
        data: [
          { x: "Emma", y: 14 },
          { closedDeals: 0, x: "Ava", y: 12 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "rep",
        yLabel: "deals",
      },
    });
  });
  it("Real world: data is array of arrays", () => {
    const out = formatPlotData({
      type: "plot",
      args: {
        title: "title",
        type: "line",
        data: [
          ["Emma", 14],
          ["Ava", 12],
        ],
        labels: { x: "rep", y: "deals" },
      },
    });
    expect(out).toEqual({
      role: "graph",
      content: {
        data: [
          { x: "Emma", y: 14 },
          { x: "Ava", y: 12 },
        ],
        graphTitle: "title",
        type: "line",
        xLabel: "rep",
        yLabel: "deals",
      },
    });
  });
});

describe("checkCodeExecutionOutput", () => {
  it("null", () => {
    expect(checkCodeExecutionOutput(null, 1)).toEqual({
      isValid: false,
      retry: true,
    });
  });
  it("Only calls, no logs or plots", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: true });
  });
  it("1 log", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
          {
            type: "log",
            args: { message: "This is a log message" },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: true, retry: false });
  });
  it("Includes an error", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
          {
            type: "error",
            args: { message: "TypeError: This is an error" },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: true });
  });
  it("401 error", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
          {
            type: "error",
            args: { message: '{"status": 401, "message": "Unauthorized"}' },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: false });
  });
  it("1 plot", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "plot",
            args: {
              type: "bar",
              title: "graph",
              data: [{ x: 1, y: 2 }],
              labels: { x: "a", y: "b" },
            },
          },
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: true, retry: false });
  });
  it("Plot, no data", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "plot",
            args: {
              type: "bar",
              title: "graph",
              data: [],
              labels: { x: "a", y: "b" },
            },
          },
          {
            type: "call",
            args: { name: "searchDeals", params: { query: "Larry" } },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: true });
  });
  it("API call & plot, borked data", () => {
    expect(
      checkCodeExecutionOutput(
        [
          {
            type: "call",
            args: {
              name: "getInventoryProjections",
              params: { includeProjections: "true" },
            },
          },
          {
            type: "plot",
            args: {
              title: "Stock Levels by Product Categories",
              type: "bar",
              data: [
                { category: "undefined", totalUnits: null, totalCost: null },
              ],
              labels: { x: "Product Category", y: "Total Units" },
            },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: true });
  });
  it("API call & plot, bad value data", () => {
    expect(
      checkCodeExecutionOutput(
        [
          { type: "call", args: { name: "getInventorySummary", params: {} } },
          {
            type: "plot",
            args: {
              title: "Frozen Units Percentage",
              type: "bar",
              data: [{ x: "Frozen Units", y: null }],
              labels: { x: "Percentage (%)", y: "Value" },
            },
          },
        ],
        1,
      ),
    ).toEqual({ isValid: false, retry: true });
  });
});

describe("stripBasicTypescriptTypes", () => {
  it("Basic types", () => {
    const out = stripBasicTypescriptTypes(
      `let a: string = "hello";
let b: number = 1;`,
    );
    expect(out).toEqual(`let a = "hello";
let b = 1;`);
  });
  it("Types in function definition", () => {
    const out = stripBasicTypescriptTypes(
      `function greet(name: string): string {
    return "Hello, " + name;
}`,
    );
    expect(out).toEqual(`function greet(name) {
    return "Hello, " + name;
}`);
  });
  it("Implicit function definition", () => {
    const out = stripBasicTypescriptTypes(
      `[1,2,3,4].map((m: string): string => {
    return "Hello, " + m;
})`,
    );
    expect(out).toEqual(`[1,2,3,4].map((m) => {
    return "Hello, " + m;
})`);
  });
  it("Interface definition", () => {
    const out = stripBasicTypescriptTypes(
      `interface Person {
name: string;
}`,
    );
    expect(out).toEqual(``);
  });
  it("Type definition", () => {
    const out = stripBasicTypescriptTypes(`type Person  = string;`);
    expect(out).toEqual(``);
  });
});

describe("ensureXandYinData", () => {
  it("x and y present: do nothing", () => {
    const dataOut = ensureXandYinData({
      title: "title",
      type: "line",
      data: [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      labels: { x: "date", y: "value" },
    });
    expect(dataOut).toStrictEqual([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]);
  });
  it("x missing, get from labels", () => {
    const dataOut = ensureXandYinData({
      title: "title",
      type: "line",
      data: [
        { date: 1, y: 2 },
        { date: 1, y: 2 },
      ],
      labels: { x: "date", y: "value" },
    });
    expect(dataOut).toStrictEqual([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]);
  });
  it("y missing, get from labels", () => {
    const dataOut = ensureXandYinData({
      title: "title",
      type: "line",
      data: [
        { x: 1, value: 2 },
        { x: 1, value: 2 },
      ],
      labels: { x: "date", y: "value" },
    });
    expect(dataOut).toStrictEqual([
      { x: 1, y: 2 },
      { x: 1, y: 2 },
    ]);
  });
  it("y missing, ensure order is (x, y, other)", () => {
    const dataOut = ensureXandYinData({
      title: "title",
      type: "line",
      data: [{ x: 1, value: 2, approved: true }],
      labels: { x: "date", y: "value" },
    });
    dataOut.forEach((d) => {
      Object.entries(d).forEach(([key, value], idx) => {
        if (idx === 0) {
          expect(key).toEqual("x");
          expect(value).toStrictEqual(1);
        } else if (idx === 1) {
          expect(key).toEqual("y");
          expect(value).toStrictEqual(2);
        } else {
          expect(key).toStrictEqual("approved");
          expect(idx).toEqual(2);
          expect(value).toStrictEqual(true);
        }
      });
    });
  });
});
