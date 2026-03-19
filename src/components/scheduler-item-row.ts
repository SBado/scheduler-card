import { CSSResultGroup, LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators';
import { CardConfig, Schedule } from '../types';
import { computeActionIcon } from '../data/format/compute_action_icon';
import { formatActionDisplay } from '../data/format/format_action_display';
import { HomeAssistant } from '../lib/types';
import { computeScheduleDisplay } from '../data/format/compute_schedule_display';
import { unsafeHTML } from 'lit/directives/unsafe-html';
import { computeEntityIcon } from '../data/format/compute_entity_icon';
import { computeDomain } from '../lib/entity';

import './scheduler-relative-time';
import { DEFAULT_PRIMARY_INFO_DISPLAY, DEFAULT_SECONDARY_INFO_DISPLAY } from '../const';

@customElement('scheduler-item-row')
export class SchedulerItemRow extends LitElement {
  @property() hass!: HomeAssistant;
  @property() schedule_id!: string;
  @property() schedule!: Schedule;
  @property() config!: CardConfig;
  @property({ type: Number }) selectedDay: number = new Date().getDay();

  render() {
    try {
      const stateObj = this.hass.states[this.schedule.entity_id!];
      if (!stateObj) return html``;
      const disabled = ['off', 'completed'].includes(stateObj.state);
      const nextAction = this.schedule.entries[0].slots[this.schedule.next_entries[0] || 0].actions[0];

      let icon = computeActionIcon(nextAction, this.config.customize);
      if (this.config.display_options?.icon == 'entity') {
        let entityId = [nextAction.target?.entity_id || []].flat().shift();
        if (['script', 'notify'].includes(computeDomain(nextAction.service))) entityId = nextAction.service;
        if (entityId) icon = computeEntityIcon(entityId, this.config.customize, this.hass);
      }
      const hasRemovedEntity = ![nextAction.target?.entity_id || []]
        .flat()
        .every((entity_id) => Object.keys(this.hass.states).includes(entity_id));
      if (hasRemovedEntity) icon = 'mdi:help';

      return html`
        <ha-icon icon="${icon}" @click=${this._handleIconClick} class="${disabled ? 'disabled' : ''}"></ha-icon>

        <div
          class="info ${disabled ? 'disabled' : ''} ${hasRemovedEntity ? 'defective' : ''}"
          @click=${this._handleItemClick}
        >
          ${this.renderDisplayItem(this.config.display_options?.primary_info || DEFAULT_PRIMARY_INFO_DISPLAY)}
          <div class="secondary">
            ${this.renderDisplayItem(this.config.display_options?.secondary_info || DEFAULT_SECONDARY_INFO_DISPLAY)}
          </div>
          ${this.renderTimeline(disabled)}
        </div>
        <div class="state">
          ${this.config.show_toggle_switches !== false
          ? html`<ha-switch
                ?checked=${['on', 'triggered'].includes(stateObj.state || '')}
                ?disabled=${stateObj.state == 'completed'}
                @click=${this._toggleEnableDisable}
              ></ha-switch>`
          : ''}
        </div>
      `;
    } catch (e) {
      return html`
        <hui-warning .hass=${this.hass} @click=${this._handleItemClick}>
          <span style="white-space: normal"> Failed to display schedule ${this.schedule.entity_id}. Reason: ${e} </span>
        </hui-warning>
      `;
    }
  }

  private renderTimeline(disabled: boolean) {
    const slots = this.schedule.entries[0]?.slots;
    if (!slots || slots.length <= 1) return nothing;

    const TOTAL_MINS = 24 * 60;

    const toMins = (t: string): number => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };

    const COLORS = [
      '#1e88e5', // blue
      '#43a047', // green
      '#f9a825', // yellow
      '#e53935', // red
      '#8e24aa', // purple
      '#00897b', // teal
      '#fb8c00', // orange
      '#546e7a', // blue-grey
    ];

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowPct = (nowMins / TOTAL_MINS) * 100;
    const isToday = this.selectedDay === now.getDay();

    const segments = slots.map((slot, i) => {
      const start = toMins(slot.start);
      const end = i < slots.length - 1 ? toMins(slots[i + 1].start) : TOTAL_MINS;
      const widthPct = ((end - start) / TOTAL_MINS) * 100;
      const isActive = isToday && !disabled && nowMins >= start && nowMins < end;
      const action = slot.actions?.[0];
      const shortLabel = action ? formatActionDisplay(action, this.hass, this.config.customize, true) : '';
      const actionLabel = shortLabel || action?.service?.split('.').pop() || '';
      return { start, end, widthPct, isActive, actionLabel, hasAction: !!slot.actions?.length };
    });

    return html`
      <div class="timeline-wrap">
        <div class="timeline-bar">
          ${segments.map(
      (seg, i) => html`
              <div
                class="timeline-seg ${seg.isActive ? 'active' : ''} ${!seg.hasAction ? 'no-action' : ''}"
                style="
                  width: ${seg.widthPct.toFixed(2)}%;
                  background: ${seg.hasAction ? COLORS[i % COLORS.length] : 'var(--disabled-text-color, #9e9e9e)'};
                  ${seg.isActive
          ? 'outline: 2px solid var(--primary-color); outline-offset: -2px; opacity: 1;'
          : 'opacity: 0.72;'}
                "
                title="${slot_label(seg.actionLabel, seg.start, seg.end)}"
              >
                ${seg.widthPct > 9 ? seg.actionLabel : ''}
              </div>
            `
    )}
          ${isToday && !disabled ? html`<div class="timeline-now" style="left: ${nowPct.toFixed(2)}%"></div>` : nothing}
        </div>
        <div class="timeline-labels">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    `;
  }

  private renderDisplayItem(displayItem: string | string[]) {
    const replacePreservedTags = (input: string) => {
      const parts = input.split('<relative-time></relative-time>');
      if (parts.length > 1) {
        const ts = this.schedule.timestamps![this.schedule.next_entries[0] || 0];
        return html`
          ${parts[0] ? unsafeHTML(parts[0]) : ''}
          <scheduler-relative-time .hass=${this.hass} .datetime=${new Date(ts)}> </scheduler-relative-time>
          ${parts[1] ? unsafeHTML(parts[1]) : ''}
        `;
      }
      const res = input.match(/^(<tag>[^<]*<\/tag>)+$/);
      if (res !== null) {
        const tags = input.split(/<tag>([^<]*)<\/tag>/).filter((e) => e);
        return html` <div class="tags">${tags?.map((e) => html`<span class="tag">${e}</span>`)}</div>`;
      }
      return unsafeHTML(input);
    };

    return computeScheduleDisplay(this.schedule, displayItem, this.hass, this.config.customize)
      .filter((e) => e.length)
      .map((e) => html`${replacePreservedTags(e)}<br />`);
  }

  private _handleItemClick(_ev: Event) {
    const myEvent = new CustomEvent('editClick', { detail: { schedule_id: this.schedule_id } });
    this.dispatchEvent(myEvent);
  }

  private _handleIconClick(_ev: Event) {
    const myEvent = new CustomEvent('editClick', { detail: { schedule_id: this.schedule_id } });
    this.dispatchEvent(myEvent);
  }

  private _toggleEnableDisable(ev: Event) {
    ev.stopPropagation();
    const checked = !(ev.target as HTMLInputElement).checked;
    this.hass.callService('switch', checked ? 'turn_on' : 'turn_off', { entity_id: this.schedule.entity_id });
  }

  static get styles(): CSSResultGroup {
    return css`
      :host {
        display: flex;
        align-items: center;
        flex-direction: row;
      }
      .info {
        margin-left: 16px;
        margin-right: 8px;
        margin-inline-start: 16px;
        margin-inline-end: 8px;
        flex: 1 1 30%;
        transition: color 0.2s ease-in-out;
        cursor: pointer;
      }
      .info,
      .info > * {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .timeline-wrap {
        white-space: normal;
        overflow: visible;
      }
      .flex ::slotted(*) {
        margin-left: 8px;
        margin-inline-start: 8px;
        margin-inline-end: initial;
        min-width: 0;
      }
      .flex ::slotted([slot='secondary']) {
        margin-left: 0;
        margin-inline-start: 0;
        margin-inline-end: initial;
      }
      .secondary,
      ha-relative-time {
        color: var(--secondary-text-color);
        transition: color 0.2s ease-in-out;
      }
      .state {
        text-align: var(--float-end);
      }
      .value {
        direction: ltr;
      }
      ha-icon {
        display: flex;
        flex: 0 0 40px;
        color: var(--state-icon-color);
        transition: color 0.2s ease-in-out;
        cursor: pointer;
        align-items: center;
        justify-content: center;
      }
      ha-icon.disabled {
        color: var(--disabled-text-color);
      }
      div.disabled {
        --primary-text-color: var(--disabled-text-color);
        --secondary-text-color: var(--disabled-text-color);
        --state-icon-color: var(--disabled-text-color);
        color: var(--disabled-text-color);
      }
      div.tags {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
      span.tag {
        height: 28px;
        border-radius: 14px;
        background: rgba(var(--rgb-primary-color), 0.4);
        color: var(--primary-text-color);
        line-height: 1.25rem;
        font-size: 0.875rem;
        padding: 0px 12px;
        display: flex;
        align-items: center;
        box-sizing: border-box;
      }
      .defective {
        text-decoration: line-through;
      }

      /* ── Timeline ── */
      .timeline-wrap {
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .timeline-bar {
        position: relative;
        display: flex;
        width: 100%;
        height: 18px;
        border-radius: 4px;
        overflow: hidden;
      }
      .timeline-seg {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 500;
        color: #fff;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: clip;
        padding: 0 2px;
        box-sizing: border-box;
        min-width: 0;
        transition: opacity 0.2s;
        cursor: default;
      }
      .timeline-now {
        position: absolute;
        top: 0;
        width: 2px;
        height: 100%;
        background: #fff;
        opacity: 0.9;
        transform: translateX(-50%);
        pointer-events: none;
        border-radius: 1px;
      }
      .timeline-labels {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        color: var(--secondary-text-color);
        line-height: 1;
      }
    `;
  }
}

// Helper kept outside the class to avoid 'this' binding issues in template literals
function slot_label(action: string, start: number, stop: number): string {
  return stop ? `${action} (${start} – ${stop})` : `${action} (${start})`;
}
