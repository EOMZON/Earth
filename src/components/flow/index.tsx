import React, { useCallback, useRef, useEffect } from 'react';

import ReactFlow, {
  Controls,
  OnConnectEnd,
  OnConnectStart,
  Panel,
  useStoreApi,
  Node,
  useReactFlow,
  ReactFlowProvider,
  NodeOrigin,
  ConnectionLineType,
  SelectionMode, MiniMap, Background, ReactFlowInstance
} from 'reactflow';
import { shallow } from 'zustand/shallow';

import { Button, Input, Checkbox, Card, Divider, Collapse } from 'antd';

const { Panel: Panel0 } = Collapse;
const { TextArea } = Input;
import { nanoid } from 'nanoid/non-secure';

import useStore, { RFState } from './store';
import BWNode from './BWNode';
import BWEdge from './BWEdge';
import RoleNode from './RoleNode';

// we need to import the React Flow styles to make it work
import 'reactflow/dist/style.css';


const _VERVISON = '0.1.0',
  _APP = 'brainwave';


const _DEFAULTCOMBO = {
  tag: '',
  combo: 1,
  interfaces: [],
  isInfinite: false,
  owner: 'user',
  prompt: {},
  version: _VERVISON,
  app: _APP,
  id: '',
  createDate: (new Date()).getTime()
}


declare const window: Window &
  typeof globalThis & {
    _brainwave_import: any,
    _brainwave_get_current_node_for_workflow: any,
    _brainwave_get_workflow_data: any,
    _brainwave_save_callback: any,
    _brainwave_save_callback_init: any,
    _brainwave_debug_callback: any
  }

const selector = (state: RFState) => ({
  comboOptions: state.comboOptions,
  id: state.id,
  tag: state.tag,
  defaultNode: state.defaultNode,
  nodes: state.nodes,
  edges: state.edges,
  onComboOptionsChange: state.onComboOptionsChange,
  onTagChange: state.onTagChange,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  newCombo: state.newCombo,
  addChildNode: state.addChildNode,
});

const nodeTypes = {
  role: RoleNode,
  brainwave: BWNode,
};

const edgeTypes = {
  brainwave: BWEdge,
};

const nodeOrigin: NodeOrigin = [0.5, 0.5];
const connectionLineStyle = { stroke: '#F6AD55', strokeWidth: 3 };
const defaultEdgeOptions = { style: connectionLineStyle, type: 'brainwave' };

function Flow(props: any) {

  const { debug, loadData, isNew } = props;
  // console.log('Flow isNew', isNew)
  if (typeof (localStorage) !== 'undefined') localStorage.setItem('isNew', isNew ? '1' : '');

  const reactFlowInstance = useReactFlow();
  const [isSaveCallback, setIsSaveCallback] = React.useState(false)
  // whenever you use multiple values, you should use shallow for making sure that the component only re-renders when one of the values change
  const {
    comboOptions,
    id,
    tag,
    defaultNode,
    nodes,
    edges,
    onTagChange,
    onComboOptionsChange,
    onNodesChange,
    onEdgesChange,
    newCombo,
    addChildNode
  } = useStore(selector, shallow);

  const connectingNodeId = useRef<string | null>(null);
  const store = useStoreApi();
  const { project } = useReactFlow();

  const getChildNodePosition = (event: MouseEvent, parentNode?: Node) => {
    const { domNode } = store.getState();

    if (
      !domNode ||
      // we need to check if these properites exist, because when a node is not initialized yet,
      // it doesn't have a positionAbsolute nor a width or height
      !parentNode?.positionAbsolute ||
      !parentNode?.width ||
      !parentNode?.height
    ) {
      return;
    }

    const { top, left } = domNode.getBoundingClientRect();

    // we need to remove the wrapper bounds, in order to get the correct mouse position
    const panePosition = project({
      x: event.clientX - left + 100,
      y: event.clientY - top,
    });

    // we are calculating with positionAbsolute here because child nodes are positioned relative to their parent
    return {
      x: panePosition.x - parentNode.positionAbsolute.x + parentNode.width / 2,
      y: panePosition.y - parentNode.positionAbsolute.y + parentNode.height / 2,
    };
  };

  const onConnectStart: OnConnectStart = useCallback((_, { nodeId }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event: any) => {
      const { nodeInternals } = store.getState();
      const targetIsPane = (event.target as Element).classList.contains('react-flow__pane');

      if (targetIsPane && connectingNodeId.current) {
        const parentNode = nodeInternals.get(connectingNodeId.current);
        const childNodePosition = getChildNodePosition(event, parentNode);

        if (parentNode && childNodePosition) {
          addChildNode(parentNode, childNodePosition);
        }
      };
      // setTimeout(() => onSave(), 200)
    },
    [getChildNodePosition]
  );

  const panOnDrag = [1, 2];

  const nodeColor: any = (node: { id: any; }) => {
    switch (node.id) {
      case 'root':
        return '#6ede87';
      case 'output':
        return '#6865A5';
      default:
        return '#ff0072';
    }
  };

  const variant: any = 'dots';

  // 导出
  const exportDataToEarth: any = () => {
    const defaultCombo = {
      ..._DEFAULTCOMBO,
      createDate: (new Date()).getTime()
    }

    const workflow: any = {};
    const { edges, nodes } = reactFlowInstance.toObject();
    if (edges.length == 0 && nodes.length == 1) {
      // 只有一个，则导出
      const id = nodes[0].id.match('root_') ? 'root' : nodes[0].id
      workflow[id] = nodes[0].data
    }
    // console.log(nodes)
    for (const edge of edges) {
      let { source, target } = edge;
      source = source.match('root_') ? 'root' : source;
      target = target.match('root_') ? 'root' : target;

      const sourceNode: any = nodes.filter(node => (node.id.match('root_') ? 'root' : node.id) === source)[0];
      const targetNode: any = nodes.filter(node => (node.id.match('root_') ? 'root' : node.id) === target)[0];
      if (sourceNode && targetNode) {
        workflow[source] = { ...sourceNode.data, nextId: target };
        workflow[target] = targetNode.data;
      }
    }
    const items: any = [];
    // console.log(workflow)
    // 按顺序从到尾
    const getItems = (id: string, callback: any) => {
      if (workflow[id]) {
        items.push(workflow[id]);
        let nextId = workflow[id].nextId;
        if (nextId) {
          getItems(nextId, callback)
        } else {
          return callback(items)
        }
      }
    }

    return new Promise((res, rej) => {
      getItems('root', (result: any) => {
        const items = JSON.parse(JSON.stringify(result))
        // 按照combo的格式输出
        const combo: any = { ...defaultCombo, tag, id: id }
        for (let index = 0; index < items.length; index++) {
          const prompt = items[index];
          delete prompt.onChange;
          delete prompt.opts;
          if (index === 0) {
            combo.prompt = prompt;
          }
          if (index > 0) {
            combo[`prompt${index + 1}`] = prompt;
          }
          combo.combo = index + 1;
        }

        // interfaces
        combo.interfaces = Array.from(comboOptions, (c: any) => {
          if (c.checked) return c.value
        }).filter(f => f)
        res(combo)
      })
    })
  }

  const download = () => {
    exportDataToEarth().then((combo: any) => {
      console.log('download', combo)
      const fileName = `${combo.tag}_${combo.id}`
      const data = [combo]
      const link = document.createElement('a');
      link.href = `data:application/json;charset=utf-8,\ufeff${encodeURIComponent(JSON.stringify(data))}`;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })
  }

  const save = () => {
    if (typeof (window) !== 'undefined') {
      if (window._brainwave_save_callback) {
        window._brainwave_save_callback()
      }
    }
  }

  const load = (json: any) => {
    if (json && json.length == 1) {

      // 将覆盖
      // if (currentNodes.length > 0) 1

      // 导入
      const combo = json[0];

      let nodes: any = [],
        source = 'root_' + nanoid(),
        edges = [];
      for (let index = 0; index < combo.combo; index++) {
        const key = `prompt${index > 0 ? index + 1 : ''}`
        if (combo[key]) {
          const id = index == 0 ? source : key + combo.id;
          nodes.push({
            data: combo[key],
            height: 597,
            id,
            position: { x: (312 + 100) * index, y: 0 },
            type: combo[key].type == 'role' ? 'role' : "brainwave",
            width: 312,
            deletable: index > 0
          });

          if (source != id) edges.push({
            source,
            target: id,
            id: source + '_' + id,
            type: 'straight',
            animated: true,
            label: nodes.filter((node: any) => node.id == source)[0].data.output,
            deletable: true,
          })

          // console.log(nodes.filter((node: any) => node.id == source)[0])

          source = id;

        }
      }

      console.log('newCombo', combo)
      newCombo(combo.id, combo.tag, combo.interfaces, nodes, edges, debug);

      clearLocalStore()

    }
  }


  const openMyCombo = () => {
    const currentNodes = nodes;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ".json"
    document.body.appendChild(input);
    input.addEventListener('change', (e: any) => {
      const files = e.target.files;
      if (files.length == 1) {
        let file = files[0];
        let fileReader = new FileReader();
        fileReader.readAsText(file);
        fileReader.onload = function () {
          // 获取得到的结果
          const data: any = this.result;
          const json = JSON.parse(data);
          if (json && json.length == 1) {
            load(json)
          }
        }
      }
      input.remove();
    }, false)
    input.click();
  }

  if (typeof (window) !== 'undefined') {
    var timer = setTimeout(function () {
      window._brainwave_import = load;
      window._brainwave_get_current_node_for_workflow = () => {
        const n = nodes.filter(n => n.selected)[0];
        const combo = {
          ..._DEFAULTCOMBO,
          prompt: n.data,
          createDate: (new Date()).getTime()
        }
        return combo
      };
      window._brainwave_get_workflow_data = () => exportDataToEarth();
      window._brainwave_save_callback_init = () => setIsSaveCallback(true)
    }, 200);
  }

  const onSave = useCallback(() => {
    if (reactFlowInstance) {
      const flow: any = reactFlowInstance.toObject();

      // interfaces
      flow.interfaces = Array.from(comboOptions, (c: any) => {
        if (c.checked) return c.value
      }).filter(f => f);

      flow.tag = tag;

      localStorage.setItem('flowKey', JSON.stringify({ ...flow, isNew: false }));
    }
  }, [reactFlowInstance, tag, comboOptions]);

  const onRestore = useCallback(() => {
    // const restoreFlow = async () => {
    //   const flow = JSON.parse(localStorage.getItem('flowKey') || '{}');
    //   if (flow) {
    //     // console.log('flow', flow)
    //     newCombo(flow.tag || '', flow.interfaces || [], flow.nodes || [defaultNode], flow.edges || [], debug);
    //   }
    // };
    // restoreFlow();
  }, [newCombo, debug]);

  const newWorkflow = () => {
    newCombo(nanoid(), 'new', [], [defaultNode], [], debug);
  }

  const clearLocalStore = () => localStorage.setItem('flowKey', '{}');

  const onInit = (reactFlowInstance: ReactFlowInstance) => {
    const isNew = localStorage.getItem('isNew');
    // console.log('flow - - - - onInit', isNew)
    // isNew == "1" ? newWorkflow() : onRestore()
    // newWorkflow()
  }

  const onChange = () => {
    console.log('change')
    // setInterval(()=>onSave(),3000)
    // setTimeout(() => onSave(), 200)
  };

  useEffect(() => {
    if (isNew) {
      newWorkflow()
    } else {
      loadData && load(loadData)
    }
  }, [loadData, isNew])


  // console.log('loadData',loadData)


  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={nodeOrigin}
      defaultEdgeOptions={defaultEdgeOptions}
      connectionLineStyle={connectionLineStyle}
      connectionLineType={ConnectionLineType.Straight}
      fitView
      fitViewOptions={{ maxZoom: 0.8 }}
      // defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      panOnScroll
      selectionOnDrag
      panOnDrag={panOnDrag}
      selectionMode={SelectionMode.Partial}
      onInit={onInit}
      onChange={onChange}
    >
      <Controls position={'bottom-left'} />
      <MiniMap nodeColor={nodeColor} nodeStrokeWidth={3} zoomable pannable inversePan={false} ariaLabel={null} />
      <Background variant={variant} />

      {/* <Panel position="top-left">
        NODES
      </Panel> */}



      <Panel position="top-right">
        <Card style={{ width: '300px' }}>
          <Collapse defaultActiveKey={['1']} ghost size="small">
            <Panel0 header="菜单" key="1">
              <p>名称</p>
              <TextArea placeholder="输入名称..."
                autoSize
                value={tag}
                onChange={(e: any) => onTagChange(e.target.value)}
              />
              <p>Interfaces</p>
              <Checkbox.Group
                options={comboOptions}
                value={
                  Array.from(comboOptions,
                    (c: any) => c.checked ? c.value : null)
                    .filter(f => f)}
                onChange={onComboOptionsChange}
              />
              <Divider dashed />
              <p>文件</p>
              {
                isSaveCallback ? <Button onClick={() => save()} style={{ marginRight: '24px' }}>保存</Button> : ''
              }
              <Button onClick={() => download()} style={{ marginRight: '24px' }}>导出</Button>
              <Button onClick={() => openMyCombo()} style={{ marginRight: '24px' }}>打开</Button>
            </Panel0>
          </Collapse>
        </Card>
      </Panel>
    </ReactFlow>
  );
}

export default (props: any) => {
  const { debug, loadData, isNew } = props;
  return (<ReactFlowProvider >
    <Flow debug={debug} loadData={loadData} isNew={isNew} />
  </ReactFlowProvider>)
};


