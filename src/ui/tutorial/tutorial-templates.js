/**
 * The tutorial's steps and the modal that shows one
 */

import { t } from "../../i18n/i18n-manager.js";

export const TUTORIAL_TEMPLATES = {
  /**
   * The tutorial steps, in the current language. A step is named in words
   * only, without a picture.
   * @returns {Array} Tutorial steps
   */
  getSteps() {
    const steps = [
      {
        title: t("tutorial.step1Title"),
        content: `
                    ${t("tutorial.step1Content")}
                    <div style='color:var(--text-secondary);font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.keyHint")}
                    </div>
                `,
        target: null,
      },
      {
        title: t("tutorial.step2Title"),
        content: t("tutorial.step2Content"),
        target: "#api-key-help",
      },
      {
        title: t("tutorial.step3Title"),
        content: `
                    ${t("tutorial.step3Content")}
                `,
        target: "#steam-token-help-link",
      },
      {
        title: t("tutorial.step4Title"),
        content: `
                    ${t("tutorial.step4Content")}
                `,
        target: "#auth",
      },
      {
        title: t("tutorial.step5Title"),
        content: t("tutorial.step5Content"),
        target: "#update-friends-btn",
      },
      {
        title: t("tutorial.step6Title"),
        content: t("tutorial.step6Content"),
        target: "#friend-filter-input",
      },
      {
        title: t("tutorial.step7Title"),
        content: t("tutorial.step7Content"),
        target: "#friends",
      },
      {
        title: t("tutorial.step8Title"),
        content: `
                    ${t("tutorial.step8Content")}
                `,
        target: ".friend .action-btn",
      },
      {
        title: t("tutorial.step9Title"),
        content: `
                    ${t("tutorial.step9ContentTop")}
                    <div style='color:var(--text-secondary);font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.step9ContentNote1")}<br>
                        ${t("tutorial.step9ContentNote2")}<br>
                        ${t("tutorial.step9ContentNote3")}
                    </div>
                `,
        target: ".friend .status-label",
      },
      {
        title: t("tutorial.step10Title"),
        content: `
                    ${t("tutorial.step10ContentTop")}
                    <div style='color:var(--text-secondary);font-size:0.95em;text-align:center;margin-top:15px;'>
                        ${t("tutorial.step10ContentNote1")}<br>
                        ${t("tutorial.step10ContentNote2")}
                    </div>
                    <div style='text-align:center;margin-top:15px;'>
                        <button type='button' id='github-releases-link' class='link-btn'>${t("tutorial.githubReleases")}</button>
                    </div>
                `,
        target: null,
      },
    ];

    return steps;
  },

  /**
   * Tutorial modal content
   * @param {string} title - Tutorial step title
   * @param {number} currentStepNumber - Current step number (1-based)
   * @param {number} totalSteps - Total number of steps
   * @param {string} content - Tutorial step content
   * @param {boolean} isFirstStep - Whether this is the first step
   * @param {boolean} isLastStep - Whether this is the last step
   * @returns {string} Tutorial modal HTML
   */
  MODAL_CONTENT: (
    title,
    currentStepNumber,
    totalSteps,
    content,
    isFirstStep,
    isLastStep
  ) => {
    return `
        <div class="tutorial-header">
            <h3 class="tutorial-title">${title}</h3>
            <div class="tutorial-progress">
                <span class="tutorial-step-counter">${t("tutorial.stepCounter", { current: currentStepNumber, total: totalSteps })}</span>
                <div class="tutorial-progress-bar">
                    <div class="tutorial-progress-fill" style="width: ${(currentStepNumber / totalSteps) * 100}%"></div>
                </div>
            </div>        
        </div>
        <div class="tutorial-content">${content}</div>        
        <div class="tutorial-controls">
            <button class="tutorial-btn tutorial-btn-secondary">
                ${t("common.skipTutorial")}
            </button>            
            <div class="tutorial-nav-buttons">
                <button class="tutorial-btn tutorial-btn-secondary" 
                        ${isFirstStep ? "disabled" : ""}>
                    ${t("common.previous")}
                </button>
                <button class="tutorial-btn tutorial-btn-primary">
                    ${isLastStep ? t("common.finish") : t("common.next")}
                </button>
            </div>
        </div>`;
  },
};
