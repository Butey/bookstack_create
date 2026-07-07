import React, { useEffect, useRef } from 'react';
import type * as D3Type from 'd3';

export interface MindMapNode {
  name: string;
  children?: MindMapNode[];
  _children?: MindMapNode[]; // For collapsed state
}

export function parseMarkdownListToTree(md: string): MindMapNode {
  const lines = md.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
  if (lines.length === 0) return { name: 'Пустая структура' };

  const root: MindMapNode = { name: 'Mindmap', children: [] };
  const stack: { node: MindMapNode; indent: number }[] = [{ node: root, indent: -1 }];

  for (const line of lines) {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    const name = line.replace(/^(\s*[-*]\s*)/, '').trim();

    const newNode: MindMapNode = { name, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    if (!parent.children) parent.children = [];
    parent.children.push(newNode);

    stack.push({ node: newNode, indent });
  }

  if (root.children?.length === 1) {
      return root.children[0];
  }

  return root;
}

interface InteractiveMindmapProps {
  data: MindMapNode;
}

export const InteractiveMindmap = React.memo(function InteractiveMindmap({ data }: InteractiveMindmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current || !data) return;

    let isMounted = true;

    const renderMindmap = async () => {
      // Dynamic import of D3 to heavily save CPU and memory during Vite build
      const d3 = await import('d3');
      if (!isMounted || !svgRef.current || !wrapperRef.current) return;

      const width = wrapperRef.current.clientWidth;
      const height = wrapperRef.current.clientHeight || 500;
      
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const margin = {top: 20, right: 120, bottom: 20, left: 120};
      const dx = 35;
      const dy = width / 5;
      
      // We create an internal mutable hierarchy type
      type ExtendedHierarchyNode = D3Type.HierarchyNode<MindMapNode> & {
        x0?: number;
        y0?: number;
        _children?: D3Type.HierarchyNode<MindMapNode>[] | null;
        id?: string | number;
      };

      const root = d3.hierarchy<MindMapNode>(data) as ExtendedHierarchyNode;
      root.x0 = dy / 2;
      root.y0 = 0;

      // Collapse children after the second level to avoid clutter
      root.descendants().forEach((d: any, i) => {
        d.id = i.toString();
        d._children = d.children;
        if (d.depth > 1 && d.children) {
           d.children = undefined;
        }
      });

      const g = svg.append("g");

      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        });

      svg.call(zoom as any);

      const tree = d3.tree<MindMapNode>().nodeSize([dx, dy]);
      const diagonal = d3.linkHorizontal<D3Type.HierarchyPointLink<MindMapNode>, D3Type.HierarchyPointNode<MindMapNode>>()
          .x(d => d.y)
          .y(d => d.x);

      let i = 0;

      function update(source: any) {
        const duration = 250;
        const nodes = root.descendants() as ExtendedHierarchyNode[];
        const links = root.links();

        tree(root);

        let left: ExtendedHierarchyNode = root;
        let right: ExtendedHierarchyNode = root;
        root.eachBefore((node: any) => {
          if (node.x < left.x!) left = node;
          if (node.x > right.x!) right = node;
        });

        const node = g.selectAll<SVGGElement, ExtendedHierarchyNode>("g.node")
          .data(nodes, d => d.id as any);

        const nodeEnter = node.enter().append("g")
            .attr("class", "node cursor-pointer")
            .attr("transform", d => `translate(${source.y0},${source.x0})`)
            .attr("fill-opacity", 0)
            .attr("stroke-opacity", 0)
            .on("click", (event, d: ExtendedHierarchyNode) => {
              if (d.children) {
                  d._children = d.children;
                  d.children = undefined;
              } else {
                  d.children = d._children as any;
                  d._children = null;
              }
              update(d);
            });

        nodeEnter.append("circle")
            .attr("r", 5)
            .attr("fill", d => d._children ? "#1a1a1a" : "#fff")
            .attr("stroke", "#1a1a1a")
            .attr("stroke-width", 1.5);

        nodeEnter.append("text")
            .attr("dy", "0.31em")
            .attr("x", d => d._children || d.children ? -8 : 8)
            .attr("text-anchor", d => d._children || d.children ? "end" : "start")
            .text(d => d.data.name)
            .attr("class", "font-sans text-xs tracking-wide")
            .clone(true).lower()
            .attr("stroke", "white")
            .attr("stroke-width", 3);

        const nodeUpdate = node.merge(nodeEnter).transition()
            .duration(duration)
            .attr("transform", d => `translate(${d.y},${d.x})`)
            .attr("fill-opacity", 1)
            .attr("stroke-opacity", 1);

        nodeUpdate.select("circle")
            .attr("fill", d => d._children ? "#1a1a1a" : "#fff");

        const nodeExit = node.exit().transition()
            .duration(duration)
            .attr("transform", d => `translate(${source.y},${source.x})`)
            .attr("fill-opacity", 0)
            .attr("stroke-opacity", 0)
            .remove();

        const link = g.selectAll<SVGPathElement, D3Type.HierarchyPointLink<MindMapNode>>("path.link")
          .data(links, d => d.target.id as any);

        const linkEnter = link.enter().insert("path", "g")
            .attr("class", "link")
            .attr("d", d => {
              const o = {x: source.x0, y: source.y0};
              return diagonal({source: o, target: o} as any);
            })
            .attr("fill", "none")
            .attr("stroke", "#ccc")
            .attr("stroke-width", 1.5);

        link.merge(linkEnter).transition()
            .duration(duration)
            .attr("d", diagonal as any);

        link.exit().transition()
            .duration(duration)
            .attr("d", d => {
              const o = {x: source.x, y: source.y};
              return diagonal({source: o, target: o} as any);
            })
            .remove();

        root.eachBefore(d => {
          d.x0 = d.x;
          d.y0 = d.y;
        });
      }

      update(root);
      
      // Initial Zoom to fit the width appropriately
      svg.call(zoom.transform as any, d3.zoomIdentity.translate(margin.left, height / 2).scale(0.9));
    };

    renderMindmap();

    return () => {
      isMounted = false;
    };
  }, [data]);

  return (
    <div ref={wrapperRef} className="w-full h-full min-h-[400px] bg-slate-50 border border-editorial-text rounded overflow-hidden">
      <svg ref={svgRef} className="w-full h-full cursor-move" />
    </div>
  );
});
