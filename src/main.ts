import { animationFrames, animationFrameScheduler, BehaviorSubject, combineLatest, concat, defer, fromEvent, merge, of, Subject, timer } from 'rxjs';
import { bufferTime, distinctUntilChanged, filter, map, reduce, repeat, repeatWhen, scan, shareReplay, switchMap, takeUntil, takeWhile, tap, throttleTime, windowTime } from 'rxjs/operators';
import { Pane } from 'tweakpane';
import './styles.css';

const paneParams = {
  height: 640,
  width: 640,

  dimension: 32,
  gapModifier: 0.1,
  depthScalar: 1,
  baseSize: 5,

  color1: '#222831',
  color2: '#393e46',
  color3: '#00ADB5',
  color4: '#EEEEEE',
};

const timelineParams = {
  duration: 0
}

type PaneParams = typeof paneParams;
type TimelineParams = typeof timelineParams;

const projectX = (width: number, normalizedX: number) => (width / 2) * (1 + normalizedX);
const projectY = (height: number, normalizedY: number) => (1 - normalizedY) * (height / 2);

interface Vector {
  x: number;
  y: number;
  z: number;
}

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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const init = () => {
  const canvasContainer = document.getElementById('canvas-container') as HTMLElement | null;
  if (!canvasContainer) {
    throw new Error('Could not find canvas container in document');
  }

  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Please check why canvas does not have a 2d render context');
  }

  const slider = document.getElementById('slider');
  if (!slider) {
    throw new Error('Slider');
  }

  const indicator = slider.querySelector('.slider-indicator') as HTMLElement | null;
  if (!indicator) {
    throw new Error('Indicator');
  }

  const circleSlider = document.getElementById('circle-slider');
  if (!circleSlider) {
    throw Error('Could not find circle');
  }

  const circleIndicator = document.getElementById('circle-indicator');
  if (!circleIndicator) {
    throw Error('Could not find circle indicator');
  }

  const { width: indicatorWidth, height: indicatorHeight } = circleIndicator.getBoundingClientRect();
  const { width: circleWidth, height: circleHeight } = circleSlider.getBoundingClientRect();

  const indicatorRadiusX = indicatorWidth / 2;
  const indicatorRadiusY = indicatorHeight / 2;

  const circleRadiusX = circleWidth / 2;
  const circleRadiusY = circleHeight / 2;

  const progressCircleSlider = (p: number) => {
    const angle = (((p * 360) - 90) * Math.PI) / 180;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    const x = circleRadiusX - indicatorRadiusX + (dx * circleRadiusX);
    const y = circleRadiusY - indicatorRadiusY + (dy * circleRadiusY);

    circleIndicator.style.left = `${x}px`;
    circleIndicator.style.top = `${y}px`;
  };

  const indicatorChanges$ = fromEvent<MouseEvent>(circleSlider, 'mousedown').pipe(
    switchMap(initialEvent =>
      concat(
        of(initialEvent),
        fromEvent<MouseEvent>(document, 'mousemove').pipe(
          takeUntil(fromEvent(document, 'mouseup'))
        )
      )
    ),
    map(({ clientX, clientY }) => {
      const { left, width, top, height } = circleSlider.getBoundingClientRect();

      const pivotX = left + (width / 2);
      const pivotY = top + (height / 2);

      const deltaX = pivotX - clientX;
      const deltaY = pivotY - clientY;
      return (Math.atan2(deltaY, deltaX) / (2 * Math.PI) + 0.75) % 1;
    }),
  );

  const sliderValueChanges$ = fromEvent<MouseEvent>(slider, 'mousedown').pipe(
    switchMap(initialEvent =>
      concat(
        of(initialEvent),
        fromEvent<MouseEvent>(document, 'mousemove').pipe(
          takeUntil(fromEvent(document, 'mouseup'))
        )
      )
    ),
    map(({ clientX }) => {
      const { left, width } = slider.getBoundingClientRect();
      return clamp((clientX - left) / width, 0, 1);
    }),
  );

  const sliderValue$ = concat(
    of(0),
    merge(
      sliderValueChanges$,
      indicatorChanges$
    )
  ).pipe(
    shareReplay(1)
  );

  const controlSubject = new BehaviorSubject<Partial<PaneParams>>({});
  const updatePaneParam = <T extends keyof PaneParams>(key: T, value: PaneParams[T]) => controlSubject.next({ [key]: value });

  const timelineSubject = new BehaviorSubject<Partial<PaneParams>>({});
  const updateTimelineParam = <T extends keyof TimelineParams>(key: T, value: TimelineParams[T]) => timelineSubject.next({ [key]: value });

  const controlPane = new Pane();

  controlPane.addInput(timelineParams, 'duration', { min: 0, max: 60, step: 0.1 }).on('change', ({ value }) => updateTimelineParam('duration', value));

  const dimensionFolder = controlPane.addFolder({ title: 'Dimension' });
  dimensionFolder.addInput(paneParams, 'height', { min: 64, max: 1280, step: 1 }).on('change', ({ value }) => updatePaneParam('height', value));
  dimensionFolder.addInput(paneParams, 'width', { min: 64, max: 1280, step: 1 }).on('change', ({ value }) => updatePaneParam('width', value));

  const sketchFolder = controlPane.addFolder({ title: 'Sketch' });
  sketchFolder.addInput(paneParams, 'gapModifier', { min: 0.01, max: 1, step: 0.01 }).on('change', ({ value }) => updatePaneParam('gapModifier', value));
  sketchFolder.addInput(paneParams, 'depthScalar', { min: 0.01, max: 2, step: 0.01 }).on('change', ({ value }) => updatePaneParam('depthScalar', value));
  sketchFolder.addInput(paneParams, 'baseSize', { min: 1, max: 20, step: 1 }).on('change', ({ value }) => updatePaneParam('baseSize', value));
  sketchFolder.addInput(paneParams, 'dimension', { min: 1, max: 128, step: 1 }).on('change', ({ value }) => updatePaneParam('dimension', value));

  const colorFolder = controlPane.addFolder({ title: 'Colors' });
  colorFolder.addInput(paneParams, 'color1').on('change', ({ value }) => updatePaneParam('color1', value));
  colorFolder.addInput(paneParams, 'color2').on('change', ({ value }) => updatePaneParam('color2', value));
  colorFolder.addInput(paneParams, 'color3').on('change', ({ value }) => updatePaneParam('color3', value));
  colorFolder.addInput(paneParams, 'color4').on('change', ({ value }) => updatePaneParam('color4', value));

  const values$ = controlSubject.pipe(
    scan((acc, curr) => ({ ...acc, ...curr }), paneParams)
  );

  const timeline$ = timelineSubject.pipe(
    scan((acc, curr) => ({ ...acc, ...curr }), timelineParams)
  );

  const frame$ = sliderValue$.pipe(
    switchMap(sliderValue => timeline$.pipe(
      switchMap(({ duration }) => duration === 0 ?
        of(sliderValue) :
        animationFrames().pipe(
          map(({ elapsed }) => (sliderValue + (elapsed % (duration * 1000)) / (duration * 1000)) % 1)
        )
      ),
    )),
    tap(percentage => {
      progressCircleSlider(percentage);
      indicator.style.width = `${(percentage * 100).toFixed()}%`
    }),
    shareReplay(1)
  );

  const fps$ = defer(() => {
    const getFpsCounter = () => {
      const fpsCounter = Array.from(canvasContainer.getElementsByTagName('hks-fps-counter'))[0];
      if (fpsCounter) return fpsCounter;

      return null;
    };

    const createFpsCounter = () => {
      const newFpsCounter = document.createElement('hks-fps-counter')
      canvasContainer.appendChild(newFpsCounter);

      return newFpsCounter;
    };

    const fpsCounter = getFpsCounter() ?? createFpsCounter();

    return frame$.pipe(
      bufferTime(1000, animationFrameScheduler),
      map(frames => frames.length),
      tap(fps => fpsCounter.innerHTML = `${fps} fps`)
    );
  });

  fps$.subscribe();

  combineLatest([
    values$,
    frame$
  ]).subscribe(([values, playhead]) => {
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