import { animationFrames, BehaviorSubject, concat, of, Subject } from 'rxjs';
import { map, repeat, scan, switchMap, takeUntil, takeWhile, tap } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import './styles.css';

const paneParams = {
  height: 640,
  width: 640,

  duration: 5,

  dimension: 32,
  gapModifier: 0.1,
  depthScalar: 1,
  baseSize: 5,

  color1: '#222831',
  color2: '#393e46',
  color3: '#00ADB5',
  color4: '#EEEEEE',
};

type PaneParams = typeof paneParams;

const projectX = (width: number, normalizedX: number) => (width / 2) * (1 + normalizedX);
const projectY = (height: number, normalizedY: number) => (1 - normalizedY) * (height / 2);

interface Vector {
  x: number;
  y: number;
  z: number;
}

const draw = (context: CanvasRenderingContext2D, width: number, height: number): void => {

};

const drawVector = (context: CanvasRenderingContext2D, params: PaneParams, { x, y, z }: Vector) => {
  const projectV = projectVector({ x, y, z }, params);

  const color = (() => {
    if (z < 0.33) {
      return params.color1;
    } else if (z < 0.66) {
      return params.color2;
    } else {
      return params.color3;
    }
  })();

  drawCircle(context, projectV.x, projectV.y, projectV.w / 2, color);
};

const drawCircle = (context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void => {
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI, false);
  context.fillStyle = color;
  context.fill();
}

const projectVector = ({ x, y, z }: Vector, params: PaneParams) => {
  const h = z * params.depthScalar * params.baseSize;
  const w = z * params.depthScalar * params.baseSize;

  return {
    x: projectX(params.width, x),
    y: projectY(params.height, y),
    h,
    w,
  };
};

const init = () => {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  if (!canvas) {
    throw new Error('Could not find canvas in document');
  }

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  const controlSubject = new BehaviorSubject<Partial<PaneParams>>({});
  const updateParam = <T extends keyof PaneParams>(key: T, value: PaneParams[T]) => controlSubject.next({ [key]: value });

  const controlPane = new Pane();

  controlPane.addInput(paneParams, 'duration', { min: 0, max: 60, step: 0.1 }).on('change', ({ value }) => updateParam('duration', value));

  const dimensionFolder = controlPane.addFolder({ title: 'Dimension' });
  dimensionFolder.addInput(paneParams, 'height', { min: 64, max: 1280, step: 1 }).on('change', ({ value }) => updateParam('height', value));
  dimensionFolder.addInput(paneParams, 'width', { min: 64, max: 1280, step: 1 }).on('change', ({ value }) => updateParam('width', value));

  const sketchFolder = controlPane.addFolder({ title: 'Sketch' });
  sketchFolder.addInput(paneParams, 'gapModifier', { min: 0.01, max: 1, step: 0.01 }).on('change', ({ value }) => updateParam('gapModifier', value));
  sketchFolder.addInput(paneParams, 'depthScalar', { min: 0.01, max: 2, step: 0.01 }).on('change', ({ value }) => updateParam('depthScalar', value));
  sketchFolder.addInput(paneParams, 'baseSize', { min: 1, max: 20, step: 1 }).on('change', ({ value }) => updateParam('baseSize', value));
  sketchFolder.addInput(paneParams, 'dimension', { min: 1, max: 128, step: 1 }).on('change', ({ value }) => updateParam('dimension', value));

  const colorFolder = controlPane.addFolder({ title: 'Colors' });
  colorFolder.addInput(paneParams, 'color1').on('change', ({ value }) => updateParam('color1', value));
  colorFolder.addInput(paneParams, 'color2').on('change', ({ value }) => updateParam('color2', value));
  colorFolder.addInput(paneParams, 'color3').on('change', ({ value }) => updateParam('color3', value));
  colorFolder.addInput(paneParams, 'color4').on('change', ({ value }) => updateParam('color4', value));

  const values$ = controlSubject.pipe(
    scan((acc, curr) => ({ ...acc, ...curr }), paneParams)
  );

  values$.pipe(
    switchMap(values => values.duration === 0 ?
      of([values, 1] as const) :
      animationFrames().pipe(
        map(({ elapsed }) => Math.min(elapsed / (values.duration * 1000), 1)),
        map(x => x),
        takeWhile(playhead => playhead < 1),
        map(playhead => [values, playhead] as const),
        repeat()
      )
    )
  ).subscribe(([values, playhead]) => {
    canvas.height = values.height;
    canvas.width = values.width;

    context.fillStyle = values.color1;
    context.fillRect(0, 0, values.width, values.height);

    for (let i = -values.dimension; i < values.dimension; i++) {
      for (let j = -values.dimension; j < values.dimension; j++) {
        const x = i / values.dimension;
        const y = j / values.dimension;
        const r = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)) / Math.sqrt(2);
        const t = Math.sin(2 * (r + playhead) * Math.PI);

        drawVector(context,
          values,
          {
            x: x,
            y: y * ((t + r) / 2),
            z: r
          }
        );
      }
    }
  });
};

init();