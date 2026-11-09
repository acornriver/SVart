/**
 * 청각 다변기 (Sound Variator) - 개발용 이동 버튼
 *
 * 디버깅과 음성 제작을 위해 단계를 앞뒤로 오갑니다. 주소에 ?dev=1 을 붙일 때만 나타납니다.
 * 최종본에서 지우려면 이 파일과 index.html의 script 한 줄만 지우면 됩니다. 다른 파일은 이 파일을 쓰지 않습니다.
 */

window.addEventListener('load', () => {
  if (!new URLSearchParams(location.search).has('dev')) return;

  // 건너뛴 검사의 값을 채움 (안 채우면 뒤 단계나 결과에서 껍질·색이 비어 보임)
  const fillSkipped = (index) => {
    const gs = window.GlobalState;
    const reached = (stage) => index > FLOW_STAGES.indexOf(stage);
    const psy = gs.psychoProfile;
    if (reached('PART1_REGISTER')) gs.userEQProfile.registerPeak.register ||= 'MID';
    if (reached('PART2_SENSITIVITY')) { psy.twist ??= 0.6; psy.maxFreqHz ??= 14000; psy.sensitivity ??= 0.5; }
    if (reached('PART2_CENTER')) { psy.centerDeg ??= 0; psy.centerImage ??= 'C'; }
    if (reached('PART2_EAR')) { psy.dominantEar ??= 'RIGHT'; psy.earStrength ??= 60; }
    if (reached('PART2_PITCH')) { psy.pitchMode ??= 'F'; psy.pitchIndex ??= 1; }
  };

  const go = (index) => {
    const gs = window.GlobalState;
    if (isIntroStage(gs.currentStage)) {
      document.querySelector('.intro input').value = 'dev'; // 폼을 거쳐야 첫 화면이 닫힘
      document.querySelector('.intro form').requestSubmit();
      return;
    }
    const to = constrain(index, 0, FLOW_STAGES.length - 1);
    if (gs.currentStage === 'RESULT') stopTour();
    fillSkipped(to);
    goToStep(to);
  };

  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;display:flex;gap:6px;font:12px monospace;';
  const addButton = (text, onPress) => {
    const b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = 'padding:10px 12px;background:#111;color:#fff;border:1px solid #666;font:inherit;';
    b.addEventListener('click', () => { onPress(); lastActivity = millis(); });
    box.appendChild(b);
  };
  addButton('◀ 이전', () => go(window.GlobalState.part1.stepIndex - 1));
  addButton('다음 ▶', () => go(window.GlobalState.part1.stepIndex + 1));
  addButton('안내 건너뛰기', () => { hushVoice(); unlockInput(0); });
  addButton('⑦ L/R', () => {
    const psy = window.GlobalState.psychoProfile;
    psy.dominantEar = psy.dominantEar === 'LEFT' ? 'RIGHT' : 'LEFT';
  });
  // 버튼을 누른 터치가 p5로 넘어가 검사 입력이 되지 않게
  ['touchstart', 'touchend', 'mousedown', 'mouseup'].forEach((type) => box.addEventListener(type, (e) => e.stopPropagation()));
  document.body.appendChild(box);
});
