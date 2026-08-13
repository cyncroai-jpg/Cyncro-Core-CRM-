"use client";
import { useState } from "react";

const times = [
  "9:00 AM",
  "9:30 AM",
  "10:30 AM",
  "1:00 PM",
  "2:30 PM",
  "4:00 PM",
];
type Tab = "home" | "book" | "admin" | "studio" | "crm";
export default function Home() {
  const [tab, setTab] = useState<Tab>("home"),
    [step, setStep] = useState(1),
    [location, setLocation] = useState(""),
    [time, setTime] = useState(""),
    [view, setView] = useState("Month"),
    [date, setDate] = useState(18),
    [globalNotice, setGlobalNotice] = useState("");
  const acknowledge = (event: React.MouseEvent<HTMLElement>) => {
    const button = (event.target as HTMLElement).closest("button");
    if (!button || button.disabled) return;
    const name = (button.textContent || "Action").replace(/\s+/g, " ").trim();
    setGlobalNotice(
      name.length > 36 ? "Calendar updated" : `${name} · complete`,
    );
    window.setTimeout(() => setGlobalNotice(""), 1500);
  };
  return (
    <main onClickCapture={acknowledge}>
      {globalNotice && <div className="globalToast">✓ {globalNotice}</div>}
      <header className={tab === "home" ? "frontHeader" : ""}>
        <button className="logo logoButton" onClick={() => setTab("home")}>
          <i>Cyncro</i> Core
        </button>
        <nav>
          {[
            ["home", "Overview"],
            ["book", "Booking experience"],
            ["studio", "Core Studio"],
            ["crm", "Universal CRM"],
            ["admin", "Operations"],
          ].map((x) => (
            <button
              className={tab === x[0] ? "navon" : ""}
              onClick={() => setTab(x[0] as Tab)}
              key={x[0]}
            >
              {x[1]}
            </button>
          ))}
          <span>● DEMO LIVE</span>
        </nav>
      </header>
      {tab === "home" ? (
        <FrontExperience
          onExperience={() => setTab("book")}
          onPlatform={() => setTab("studio")}
          onOperations={() => setTab("admin")}
        />
      ) : tab === "studio" ? (
        <Studio onPreview={() => setTab("book")} />
      ) : tab === "crm" ? (
        <UniversalCRM onOpenCalendar={() => setTab("admin")} />
      ) : tab === "admin" ? (
        <Admin onCreate={() => setTab("studio")} />
      ) : (
        <section className="wrap">
          <p className="eyebrow">CYNCRO MEDIA • PRIVATE BOOKING</p>
          <div className="card">
            <aside>
              <div className="mark">C</div>
              <small>Cyncro Media</small>
              <h1>
                Executive
                <br />
                Strategy Session
              </h1>
              <p>
                A focused private session to map your goals, systems, and next
                move.
              </p>
              <hr />
              <b>◷ 30 minutes</b>
              <small>Eastern Time</small>
              <hr />
              <b>✦ Instant confirmation</b>
              <small>Email details included</small>
              <footer>◆ Conflict-protected scheduling</footer>
            </aside>
            <article>
              <div className="progress">
                <b>{step}</b> of 3
              </div>
              {step === 1 && (
                <>
                  <label>STEP 1 OF 3</label>
                  <h2>How would you like to meet?</h2>
                  <p>Choose the setting that works best for you.</p>
                  <div className="locations">
                    {[
                      ["Video call", "Meet, Zoom, or FaceTime"],
                      ["Phone call", "We’ll call your number"],
                      ["In person", "Confirm the meeting address"],
                    ].map((x) => (
                      <button
                        onClick={() => {
                          setLocation(x[0]);
                          setStep(2);
                        }}
                        key={x[0]}
                      >
                        <i>◇</i>
                        <b>{x[0]}</b>
                        <small>{x[1]}</small>
                        <em>→</em>
                      </button>
                    ))}
                  </div>
                  <div className="note">
                    <b>Your time is protected.</b> Availability updates in real
                    time with automatic double-booking protection.
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="row">
                    <div>
                      <label>STEP 2 OF 3</label>
                      <h2>Select a date & time</h2>
                    </div>
                    <div className="toggle">
                      {["Month", "Week"].map((x) => (
                        <button
                          className={view === x ? "on" : ""}
                          onClick={() => setView(x)}
                          key={x}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="calendar">
                    <div>
                      <h3>‹　 August 2026　 ›</h3>
                      <div className="days">
                        {"SMTWTFS".split("").map((x, i) => (
                          <small key={i}>{x}</small>
                        ))}
                        {Array.from({ length: 31 }, (_, i) => (
                          <button
                            className={i + 1 === date ? "selected" : ""}
                            onClick={() => {
                              setDate(i + 1);
                              setTime("");
                            }}
                            key={i}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="times">
                      <b>August {date}, 2026</b>
                      {times.map((x) => (
                        <button
                          className={time === x ? "selected" : ""}
                          onClick={() => setTime(x)}
                          key={x}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="actions">
                    <button onClick={() => setStep(1)}>Back</button>
                    <button disabled={!time} onClick={() => setStep(3)}>
                      Continue →
                    </button>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <label>STEP 3 OF 3</label>
                  <h2>Complete your booking</h2>
                  <div className="held">Held for you • 04:58</div>
                  <div className="summary">
                    August {date}, 2026 at {time}
                    <small>30 min · {location}</small>
                  </div>
                  <div className="form">
                    <input placeholder="First name" />
                    <input placeholder="Last name" />
                    <input placeholder="Email address" />
                    <input placeholder="Phone number" />
                    {location === "Video call" && (
                      <select>
                        <option>Google Meet</option>
                        <option>Zoom</option>
                        <option>Apple FaceTime</option>
                      </select>
                    )}
                    {location === "In person" && (
                      <input placeholder="Meeting address" />
                    )}
                  </div>
                  <div className="actions">
                    <button onClick={() => setStep(2)}>Back</button>
                    <button onClick={() => setStep(4)}>
                      Confirm booking →
                    </button>
                  </div>
                </>
              )}
              {step === 4 && (
                <div className="success">
                  <div>✓</div>
                  <label>BOOKING CONFIRMED</label>
                  <h2>You’re officially on the calendar.</h2>
                  <p>
                    August {date}, 2026 at {time} · {location}
                  </p>
                  <div className="note">
                    A full confirmation with meeting details has been sent to
                    your email.
                  </div>
                  <button
                    onClick={() => {
                      setStep(1);
                      setTime("");
                    }}
                  >
                    Book another session
                  </button>
                </div>
              )}
            </article>
          </div>
        </section>
      )}
    </main>
  );
}

function FrontExperience({
  onExperience,
  onPlatform,
  onOperations,
}: {
  onExperience: () => void;
  onPlatform: () => void;
  onOperations: () => void;
}) {
  const journeys = {
    "Sales & consulting": {
      promise: "Turn qualified interest into protected, high-value meetings.",
      event: "Executive Strategy Session",
      route: "Yvette · Best-fit host",
      value: "$5,000 opportunity",
      signals: ["Qualification", "Host routing", "CRM attribution"],
    },
    "Classes & events": {
      promise: "Sell every seat, automate the waitlist, and protect capacity.",
      event: "AI Systems Intensive",
      route: "Studio A · 9 of 12 seats",
      value: "$8,973 collected",
      signals: ["Seat inventory", "Deposit paid", "Waitlist active"],
    },
    "Service businesses": {
      promise:
        "Match every customer to the right team, territory, and resource.",
      event: "On-Site Consultation",
      route: "Palm Beach · Crew 02",
      value: "Route optimized",
      signals: ["Territory match", "Drive buffer", "Equipment locked"],
    },
    "Teams & resources": {
      promise: "Coordinate people, rooms, and equipment without conflicts.",
      event: "Production Review",
      route: "2 hosts · Boardroom · Display",
      value: "3 resources secured",
      signals: ["Collective availability", "Room lock", "Conflict scan"],
    },
  } as const;
  const [journey, setJourney] =
    useState<keyof typeof journeys>("Sales & consulting");
  const active = journeys[journey];
  return (
    <div className="frontExperience">
      <section className="frontHero">
        <div className="frontGlow" />
        <div className="heroCopy">
          <div className="heroKicker">
            <span>●</span> THE INTELLIGENT CALENDAR OPERATING SYSTEM
          </div>
          <h1>
            Your calendar should
            <br />
            <em>run the business.</em>
          </h1>
          <p>
            Cyncro turns every booking into a coordinated business operation—
            routing the right people, protecting capacity, collecting revenue,
            and moving the customer forward automatically.
          </p>
          <div className="heroActions">
            <button className="frontPrimary" onClick={onExperience}>
              Experience Cyncro <span>↗</span>
            </button>
            <button className="frontSecondary" onClick={onPlatform}>
              Enter Core Studio <span>→</span>
            </button>
          </div>
          <div className="heroAssurance">
            <span>Built for complex operations</span>
            <span>Engineered around your business</span>
            <span>One unified system</span>
          </div>
        </div>
        <div className="heroProduct" aria-label="Live Cyncro booking operation">
          <div className="productTop">
            <div>
              <small>LIVE OPERATION</small>
              <b>New booking processed</b>
            </div>
            <span>12:48:09</span>
          </div>
          <div className="productClient">
            <div className="clientAvatar">AL</div>
            <div>
              <small>CUSTOMER</small>
              <b>Alexandra Lewis</b>
              <span>Qualified · High intent</span>
            </div>
            <i>✓</i>
          </div>
          <div className="productRoute">
            <div className="routeLine">
              <i>1</i>
              <span>
                <small>REQUEST</small>
                <b>Executive Strategy Session</b>
              </span>
              <em>30 min</em>
            </div>
            <div className="routeLine">
              <i>2</i>
              <span>
                <small>INTELLIGENCE</small>
                <b>Availability + conflict scan</b>
              </span>
              <em className="passed">Passed</em>
            </div>
            <div className="routeLine">
              <i>3</i>
              <span>
                <small>ROUTING</small>
                <b>Best-fit host assigned</b>
              </span>
              <em>Yvette</em>
            </div>
            <div className="routeLine">
              <i>4</i>
              <span>
                <small>AUTOMATION</small>
                <b>Contact + confirmation created</b>
              </span>
              <em className="passed">Live</em>
            </div>
          </div>
          <div className="productFooter">
            <div>
              <small>REVENUE SIGNAL</small>
              <b>$5,000</b>
            </div>
            <div>
              <small>SOURCE</small>
              <b>Private link</b>
            </div>
            <span>Operation complete</span>
          </div>
        </div>
      </section>

      <section className="frontProof">
        {[
          ["01", "BOOK", "A seamless customer experience"],
          ["02", "DECIDE", "Capacity, routing, and rules applied"],
          ["03", "OPERATE", "Teams and resources coordinated"],
          ["04", "GROW", "Revenue and attribution measured"],
        ].map((item) => (
          <article key={item[0]}>
            <span>{item[0]}</span>
            <b>{item[1]}</b>
            <p>{item[2]}</p>
          </article>
        ))}
      </section>

      <section className="journeySection">
        <div className="sectionLead">
          <label>BUILT AROUND THE WAY YOU OPERATE</label>
          <h2>One system. Your business model.</h2>
          <p>
            Choose what you schedule and watch Cyncro configure the operation
            around it.
          </p>
        </div>
        <div className="journeyPicker">
          <div className="journeyTabs">
            {(Object.keys(journeys) as (keyof typeof journeys)[]).map(
              (item) => (
                <button
                  className={journey === item ? "active" : ""}
                  onClick={() => setJourney(item)}
                  key={item}
                >
                  <span>{item}</span>
                  <i>→</i>
                </button>
              ),
            )}
          </div>
          <div className="journeyCanvas">
            <div className="journeyTitle">
              <div>
                <small>LIVE USE CASE</small>
                <h3>{journey}</h3>
              </div>
              <span>Configured instantly</span>
            </div>
            <h4>{active.promise}</h4>
            <div className="journeyOperation">
              <div>
                <small>EVENT</small>
                <b>{active.event}</b>
              </div>
              <div>
                <small>ASSIGNMENT</small>
                <b>{active.route}</b>
              </div>
              <div>
                <small>BUSINESS OUTCOME</small>
                <b>{active.value}</b>
              </div>
            </div>
            <div className="signalRow">
              {active.signals.map((signal) => (
                <span key={signal}>✓ {signal}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="operationStory">
        <div className="sectionLead centered">
          <label>ONE BOOKING. THE ENTIRE OPERATION MOVES.</label>
          <h2>
            What customers see is simple.
            <br />
            What Cyncro handles is extraordinary.
          </h2>
        </div>
        <div className="operationFlow">
          {[
            ["Customer", "Chooses the experience, location, date, and time."],
            [
              "Intelligence",
              "Checks rules, capacity, conflicts, resources, and fit.",
            ],
            ["Revenue", "Collects the payment, deposit, package, or approval."],
            [
              "Operations",
              "Creates the contact, assigns the team, and locks resources.",
            ],
            [
              "Growth",
              "Launches reminders, follow-up, attribution, and analytics.",
            ],
          ].map((item, index) => (
            <article key={item[0]}>
              <span>0{index + 1}</span>
              <div>
                <h3>{item[0]}</h3>
                <p>{item[1]}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="frontCapabilities">
        <div className="capabilityStatement">
          <label>THE CYNCRO DIFFERENCE</label>
          <h2>
            Scheduling is the surface.
            <br />
            <span>Infrastructure is the product.</span>
          </h2>
          <button onClick={onPlatform}>Explore Core Studio →</button>
        </div>
        <div className="capabilityEditorial">
          {[
            [
              "01",
              "Revenue",
              "Payments, deposits, packages, coupons, and cancellation protection.",
            ],
            [
              "02",
              "Capacity",
              "Seats, waitlists, rooms, equipment, buffers, and resource locking.",
            ],
            [
              "03",
              "Intelligence",
              "Qualification, territory rules, host matching, and load balancing.",
            ],
            [
              "04",
              "Lifecycle",
              "Confirmations, reminders, approvals, follow-up, and contact history.",
            ],
            [
              "05",
              "Control",
              "Week and month views, rescheduling, analytics, and attribution.",
            ],
          ].map((item) => (
            <article key={item[0]}>
              <span>{item[0]}</span>
              <h3>{item[1]}</h3>
              <p>{item[2]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="frontFinal">
        <div>
          <label>THIS IS NOT ANOTHER BOOKING LINK.</label>
          <h2>
            It is the operating system
            <br />
            behind every appointment.
          </h2>
          <p>
            Experience the customer journey or step inside the command center.
          </p>
        </div>
        <div className="finalActions">
          <button className="frontPrimary" onClick={onExperience}>
            Start the experience ↗
          </button>
          <button className="frontSecondary" onClick={onOperations}>
            Open operations →
          </button>
        </div>
      </section>
    </div>
  );
}

const sampleEvents = [
  {
    name: "Executive Strategy Session",
    type: "1-on-1",
    duration: "30 min",
    capacity: 1,
    price: "Free",
    bookings: 38,
    status: "Published",
    slug: "executive-strategy",
  },
  {
    name: "AI Systems Intensive",
    type: "Group",
    duration: "2 hours",
    capacity: 12,
    price: "$997",
    bookings: 9,
    status: "Published",
    slug: "ai-systems-intensive",
  },
  {
    name: "Private Implementation Day",
    type: "Application",
    duration: "6 hours",
    capacity: 1,
    price: "$5,000",
    bookings: 4,
    status: "Paused",
    slug: "implementation-day",
  },
];
function Studio({ onPreview }: { onPreview: () => void }) {
  const [editing, setEditing] = useState(false),
    [section, setSection] = useState("Basics"),
    [saved, setSaved] = useState(false),
    [schedule, setSchedule] = useState("Recurring"),
    [capacity, setCapacity] = useState(12),
    [deposit, setDeposit] = useState(true),
    [waitlist, setWaitlist] = useState(true),
    [published, setPublished] = useState(true),
    [events, setEvents] = useState(sampleEvents),
    [customDates, setCustomDates] = useState([
      "August 28, 2026 · 10:00 AM – 12:00 PM · 12 seats",
      "September 4, 2026 · 1:00 PM – 3:00 PM · 12 seats",
    ]),
    [selectedHosts, setSelectedHosts] = useState(["Yvette Lomeli"]),
    [selectedResources, setSelectedResources] = useState(["Executive Studio"]),
    [questionCount, setQuestionCount] = useState(2),
    [reminder24, setReminder24] = useState(true),
    [reminder1, setReminder1] = useState(true),
    [brandName, setBrandName] = useState("Cyncro Media"),
    [bookingHeadline, setBookingHeadline] = useState(
      "Build your next advantage.",
    ),
    [buttonLabel, setButtonLabel] = useState("Reserve my session"),
    [accentColor, setAccentColor] = useState("#b51f38"),
    [pageStyle, setPageStyle] = useState("Editorial"),
    [industry, setIndustry] = useState("Consulting & professional services"),
    [intakeDepth, setIntakeDepth] = useState("Guided");
  const toggleChoice = (
    value: string,
    current: string[],
    setCurrent: (next: string[]) => void,
  ) =>
    setCurrent(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  const copyLink = (slug = "ai-systems-intensive") =>
    navigator.clipboard?.writeText(`https://cyncro.ai/book/demo/${slug}`);
  if (editing)
    return (
      <section className="studio">
        <div className="studiohead">
          <div>
            <label>CORE STUDIO · UNIVERSAL CALENDAR</label>
            <h1>Create a booking experience</h1>
            <p>
              Everything your customer sees and everything the engine enforces.
            </p>
          </div>
          <div>
            <button className="secondary" onClick={() => setEditing(false)}>
              Close
            </button>
            <button
              className="primary"
              onClick={() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 2200);
              }}
            >
              {saved ? "✓ Saved" : "Save & publish"}
            </button>
          </div>
        </div>
        <div className="editor">
          <div className="side">
            {[
              "Basics",
              "Brand & experience",
              "Availability",
              "Capacity & price",
              "Hosts & resources",
              "Questions",
              "Rules & messages",
              "Link settings",
            ].map((x) => (
              <button
                className={section === x ? "active" : ""}
                onClick={() => setSection(x)}
                key={x}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="editbody">
            {section === "Basics" && (
              <Panel
                title="Event basics"
                sub="Choose the experience and create the booking link."
              >
                <div className="fields">
                  <Field label="Event name">
                    <input defaultValue="AI Systems Intensive" />
                  </Field>
                  <Field label="Booking link">
                    <div className="prefix">
                      cyncro.ai/book/
                      <input defaultValue="ai-systems-intensive" />
                    </div>
                  </Field>
                  <Field wide label="Description">
                    <textarea
                      rows={4}
                      defaultValue="A high-impact group intensive to build and deploy your AI systems."
                    />
                  </Field>
                  <Field label="Booking experience">
                    <select>
                      <option>Instant booking</option>
                      <option>Request approval</option>
                      <option>Application only</option>
                    </select>
                  </Field>
                  <Field label="Location">
                    <select>
                      <option>Video call</option>
                      <option>Phone call</option>
                      <option>In person</option>
                      <option>Customer address</option>
                    </select>
                  </Field>
                </div>
              </Panel>
            )}
            {section === "Brand & experience" && (
              <Panel
                title="Brand & customer experience"
                sub="Make every booking page feel purpose-built for the business, audience, and offer."
              >
                <div className="experienceEditor">
                  <div className="experienceControls">
                    <div className="templateBlock">
                      <small>START FROM A BUSINESS MODEL</small>
                      <div className="templateChoices">
                        {[
                          "Consulting & professional services",
                          "Classes, events & memberships",
                          "Field service & installations",
                          "Healthcare & wellness",
                          "Enterprise teams & resources",
                          "Custom operating model",
                        ].map((item) => (
                          <button
                            className={industry === item ? "active" : ""}
                            onClick={() => setIndustry(item)}
                            key={item}
                          >
                            <i>{industry === item ? "✓" : "◇"}</i>
                            <span>{item}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fields experienceFields">
                      <Field label="Business or brand name">
                        <input
                          value={brandName}
                          onChange={(event) => setBrandName(event.target.value)}
                        />
                      </Field>
                      <Field label="Booking-page headline">
                        <input
                          value={bookingHeadline}
                          onChange={(event) =>
                            setBookingHeadline(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Primary button text">
                        <input
                          value={buttonLabel}
                          onChange={(event) =>
                            setButtonLabel(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Brand accent">
                        <div className="colorControl">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(event) =>
                              setAccentColor(event.target.value)
                            }
                          />
                          <input
                            value={accentColor.toUpperCase()}
                            onChange={(event) =>
                              setAccentColor(event.target.value)
                            }
                          />
                        </div>
                      </Field>
                    </div>
                    <div className="experienceOptionGroup">
                      <small>PAGE EXPERIENCE</small>
                      <div className="segmentedChoices">
                        {["Minimal", "Editorial", "Immersive"].map((item) => (
                          <button
                            className={pageStyle === item ? "active" : ""}
                            onClick={() => setPageStyle(item)}
                            key={item}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="experienceOptionGroup">
                      <small>CUSTOMER INTAKE</small>
                      <div className="segmentedChoices">
                        {["Fast", "Guided", "Application"].map((item) => (
                          <button
                            className={intakeDepth === item ? "active" : ""}
                            onClick={() => setIntakeDepth(item)}
                            key={item}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="experienceModules">
                      <small>CHOOSE WHAT CUSTOMERS SEE</small>
                      {[
                        [
                          "Service or event selection",
                          "Let customers choose the right experience.",
                        ],
                        [
                          "Location and video preference",
                          "Offer office, customer address, phone, Meet, Zoom, or FaceTime.",
                        ],
                        [
                          "Team member selection",
                          "Allow selection or let Cyncro route automatically.",
                        ],
                        [
                          "Pricing and deposit",
                          "Show price, packages, balance, or approval requirements.",
                        ],
                        [
                          "Custom intake questions",
                          "Collect information conditionally by answer.",
                        ],
                        [
                          "Confirmation next steps",
                          "Display preparation, documents, directions, or upsells.",
                        ],
                      ].map((item, index) => (
                        <label key={item[0]}>
                          <input type="checkbox" defaultChecked={index !== 2} />
                          <span>
                            <b>{item[0]}</b>
                            <small>{item[1]}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="experiencePreviewWrap">
                    <div className="previewToolbar">
                      <span>LIVE CUSTOMER PREVIEW</span>
                      <div>
                        <button>Desktop</button>
                        <button>Mobile</button>
                      </div>
                    </div>
                    <div
                      className={`experiencePreview ${pageStyle.toLowerCase()}`}
                      style={
                        {
                          "--custom-accent": accentColor,
                        } as React.CSSProperties
                      }
                    >
                      <div className="previewBrand">
                        <i>{brandName.slice(0, 1) || "C"}</i>
                        <b>{brandName || "Your brand"}</b>
                      </div>
                      <small>{industry.toUpperCase()}</small>
                      <h2>{bookingHeadline || "Your booking headline"}</h2>
                      <p>Choose the experience that best fits what you need.</p>
                      <div className="previewOffer active">
                        <div>
                          <b>Executive Strategy Session</b>
                          <span>30 minutes · Video or in person</span>
                        </div>
                        <i>✓</i>
                      </div>
                      <div className="previewOffer">
                        <div>
                          <b>Private Implementation Day</b>
                          <span>6 hours · Application required</span>
                        </div>
                        <i>→</i>
                      </div>
                      <div className="previewSteps">
                        <span className="active">1</span>
                        <i />
                        <span>2</span>
                        <i />
                        <span>3</span>
                        <em>{intakeDepth} flow</em>
                      </div>
                      <button className="previewCta">
                        {buttonLabel || "Continue"} →
                      </button>
                      <footer>
                        Powered by Cyncro Core · Conflict protected
                      </footer>
                    </div>
                    <div className="customizationSummary">
                      <div>
                        <small>LAYOUT</small>
                        <b>{pageStyle}</b>
                      </div>
                      <div>
                        <small>INTAKE</small>
                        <b>{intakeDepth}</b>
                      </div>
                      <div>
                        <small>MODEL</small>
                        <b>{industry.split(" ")[0]}</b>
                      </div>
                      <span>Updates appear instantly</span>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
            {section === "Availability" && (
              <Panel
                title="Availability & time slots"
                sub="Use a recurring schedule or select exact event dates."
              >
                <div className="choice">
                  <button
                    className={schedule === "Recurring" ? "chosen" : ""}
                    onClick={() => setSchedule("Recurring")}
                  >
                    Recurring schedule
                  </button>
                  <button
                    className={schedule === "Custom" ? "chosen" : ""}
                    onClick={() => setSchedule("Custom")}
                  >
                    Custom dates
                  </button>
                </div>
                {schedule === "Recurring" ? (
                  <div className="weekrows">
                    {[
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                      "Sunday",
                    ].map((d, i) => (
                      <div key={d}>
                        <input type="checkbox" defaultChecked={i < 5} />
                        <b>{d}</b>
                        <input type="time" defaultValue="09:00" />
                        <span>to</span>
                        <input type="time" defaultValue="17:00" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="customdates">
                    <button
                      className="primary"
                      onClick={() =>
                        setCustomDates([
                          ...customDates,
                          "September 11, 2026 · 10:00 AM – 12:00 PM · 12 seats",
                        ])
                      }
                    >
                      + Add date & time
                    </button>
                    {customDates.map((item, index) => (
                      <div key={`${item}-${index}`}>
                        <b>{item.split(" · ")[0]}</b>
                        <span>{item.split(" · ").slice(1).join(" · ")}</span>
                        <button
                          onClick={() =>
                            setCustomDates(
                              customDates.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="fields compact">
                  <Field label="Duration">
                    <select>
                      <option>2 hours</option>
                      <option>30 minutes</option>
                      <option>60 minutes</option>
                    </select>
                  </Field>
                  <Field label="Slot interval">
                    <select>
                      <option>30 minutes</option>
                      <option>15 minutes</option>
                    </select>
                  </Field>
                  <Field label="Buffer before">
                    <select>
                      <option>15 minutes</option>
                      <option>None</option>
                    </select>
                  </Field>
                  <Field label="Buffer after">
                    <select>
                      <option>15 minutes</option>
                      <option>None</option>
                    </select>
                  </Field>
                </div>
              </Panel>
            )}
            {section === "Capacity & price" && (
              <Panel
                title="Capacity, payment & waitlist"
                sub="Control seats and collect payment before confirmation."
              >
                <div className="fields">
                  <Field label="Seat capacity">
                    <div className="stepper">
                      <button
                        onClick={() => setCapacity(Math.max(1, capacity - 1))}
                      >
                        −
                      </button>
                      <b>{capacity}</b>
                      <button onClick={() => setCapacity(capacity + 1)}>
                        +
                      </button>
                    </div>
                  </Field>
                  <Field label="Maximum sessions per day">
                    <input type="number" defaultValue="3" />
                  </Field>
                  <Field label="Full price">
                    <input defaultValue="$997.00" />
                  </Field>
                  <Field label="Currency">
                    <select>
                      <option>USD</option>
                    </select>
                  </Field>
                </div>
                <Switch
                  label="Require a deposit"
                  desc="Collect a partial payment to reserve the seat."
                  value={deposit}
                  set={setDeposit}
                />
                {deposit && (
                  <Field label="Deposit due today">
                    <input defaultValue="$297.00" />
                  </Field>
                )}
                <Switch
                  label="Enable automatic waitlist"
                  desc="Offer cancelled seats to the next customer automatically."
                  value={waitlist}
                  set={setWaitlist}
                />
              </Panel>
            )}
            {section === "Hosts & resources" && (
              <Panel
                title="Hosts & resources"
                sub="Assign people, rooms, equipment, or vehicles."
              >
                <div className="selectcards">
                  <button
                    className={
                      selectedHosts.includes("Yvette Lomeli")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Yvette Lomeli",
                        selectedHosts,
                        setSelectedHosts,
                      )
                    }
                  >
                    <b>
                      {selectedHosts.includes("Yvette Lomeli") ? "✓ " : ""}
                      Yvette Lomeli
                    </b>
                    <span>Priority host · 100% weight</span>
                  </button>
                  <button
                    className={
                      selectedHosts.includes("Christopher Sydoriak")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Christopher Sydoriak",
                        selectedHosts,
                        setSelectedHosts,
                      )
                    }
                  >
                    <b>
                      {selectedHosts.includes("Christopher Sydoriak")
                        ? "✓ "
                        : ""}
                      Christopher Sydoriak
                    </b>
                    <span>Available host · Round robin</span>
                  </button>
                </div>
                <h3>Required resources</h3>
                <div className="selectcards">
                  <button
                    className={
                      selectedResources.includes("Executive Studio")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "Executive Studio",
                        selectedResources,
                        setSelectedResources,
                      )
                    }
                  >
                    <b>
                      {selectedResources.includes("Executive Studio")
                        ? "✓ "
                        : ""}
                      Executive Studio
                    </b>
                    <span>Room · capacity 14</span>
                  </button>
                  <button
                    className={
                      selectedResources.includes("LED Presentation Wall")
                        ? "selectedcard"
                        : ""
                    }
                    onClick={() =>
                      toggleChoice(
                        "LED Presentation Wall",
                        selectedResources,
                        setSelectedResources,
                      )
                    }
                  >
                    <b>
                      {selectedResources.includes("LED Presentation Wall")
                        ? "✓ "
                        : ""}
                      LED Presentation Wall
                    </b>
                    <span>Equipment · capacity 1</span>
                  </button>
                </div>
                <Field label="Assignment method">
                  <select>
                    <option>Weighted round robin</option>
                    <option>Single host</option>
                    <option>Collective</option>
                    <option>Group session</option>
                  </select>
                </Field>
              </Panel>
            )}
            {section === "Questions" && (
              <Panel
                title="Custom intake questions"
                sub="Collect exactly what you need before the booking."
              >
                <div className="questions">
                  <div>
                    <span>Required</span>
                    <input defaultValue="What would you like to accomplish?" />
                    <select>
                      <option>Long answer</option>
                    </select>
                    <button>•••</button>
                  </div>
                  <div>
                    <span>Optional</span>
                    <input defaultValue="What systems do you currently use?" />
                    <select>
                      <option>Short answer</option>
                    </select>
                    <button>•••</button>
                  </div>
                  {questionCount > 2 && (
                    <div>
                      <span>Optional</span>
                      <input defaultValue="Is there anything else we should know?" />
                      <select>
                        <option>Long answer</option>
                      </select>
                      <button onClick={() => setQuestionCount(2)}>
                        Remove
                      </button>
                    </div>
                  )}
                  <button
                    className="primary"
                    onClick={() => setQuestionCount(3)}
                  >
                    + Add question
                  </button>
                </div>
              </Panel>
            )}
            {section === "Rules & messages" && (
              <Panel
                title="Policies, reminders & confirmation"
                sub="Set expectations and automate every follow-up."
              >
                <div className="fields">
                  <Field label="Cancellation notice">
                    <select>
                      <option>24 hours</option>
                      <option>2 hours</option>
                    </select>
                  </Field>
                  <Field label="Reschedule notice">
                    <select>
                      <option>24 hours</option>
                      <option>2 hours</option>
                    </select>
                  </Field>
                  <Field wide label="Confirmation message">
                    <textarea
                      rows={4}
                      defaultValue="You’re confirmed! Check your email for event access and preparation details."
                    />
                  </Field>
                </div>
                <Switch
                  label="24-hour reminder"
                  desc="Email every registered attendee."
                  value={reminder24}
                  set={setReminder24}
                />
                <Switch
                  label="1-hour reminder"
                  desc="Send final location or video details."
                  value={reminder1}
                  set={setReminder1}
                />
              </Panel>
            )}
            {section === "Link settings" && (
              <Panel
                title="Publishing & link controls"
                sub="Control who can find this event and when the link works."
              >
                <Field label="Visibility">
                  <select>
                    <option>Public</option>
                    <option>Unlisted</option>
                    <option>Private</option>
                  </select>
                </Field>
                <Switch
                  label="Published"
                  desc="Customers can access and book this event."
                  value={published}
                  set={setPublished}
                />
                <Field label="Link expires">
                  <input type="datetime-local" />
                </Field>
                <div className="linkpreview">
                  <small>YOUR BOOKING LINK</small>
                  <b>cyncro.ai/book/demo/ai-systems-intensive</b>
                  <div>
                    <button onClick={() => copyLink()}>Copy link</button>
                    <button onClick={onPreview}>Open preview ↗</button>
                  </div>
                </div>
              </Panel>
            )}
          </div>
        </div>
      </section>
    );
  return (
    <section className="studio">
      <div className="studiohead">
        <div>
          <label>CORE STUDIO</label>
          <h1>Universal Calendar</h1>
          <p>
            Create, customize, control, publish, and measure every scheduling
            experience around the customer and the business.
          </p>
        </div>
        <div>
          <button
            className="secondary"
            onClick={() => {
              setSection("Brand & experience");
              setEditing(true);
            }}
          >
            Customize experience
          </button>
          <button
            className="primary"
            onClick={() => {
              setSection("Basics");
              setEditing(true);
            }}
          >
            + Create event
          </button>
        </div>
      </div>
      <div className="studiostats">
        {[
          ["ACTIVE LINKS", "2"],
          ["TOTAL BOOKINGS", "51"],
          ["SEATS AVAILABLE", "16"],
          ["REVENUE BOOKED", "$12.9K"],
        ].map((x) => (
          <div key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>Live calendar control</span>
          </div>
        ))}
      </div>
      <div className="eventgrid">
        {events.map((e, i) => (
          <article key={e.name}>
            <div className="eventtop">
              <span>{e.status}</span>
              <em>{e.type}</em>
            </div>
            <h2>{e.name}</h2>
            <p>/book/demo/{e.slug}</p>
            <div className="eventmetrics">
              <div>
                <small>DURATION</small>
                <b>{e.duration}</b>
              </div>
              <div>
                <small>CAPACITY</small>
                <b>{e.capacity}</b>
              </div>
              <div>
                <small>PRICE</small>
                <b>{e.price}</b>
              </div>
              <div>
                <small>BOOKINGS</small>
                <b>{e.bookings}</b>
              </div>
            </div>
            <div className="eventbuttons">
              <button onClick={() => setEditing(true)}>Edit</button>
              <button onClick={() => copyLink(e.slug)}>Copy link</button>
              <button
                onClick={() =>
                  setEvents(
                    events.map((item, index) =>
                      index === i
                        ? {
                            ...item,
                            status:
                              item.status === "Published"
                                ? "Paused"
                                : "Published",
                          }
                        : item,
                    ),
                  )
                }
              >
                {e.status === "Published" ? "Pause" : "Publish"}
              </button>
              <button
                onClick={() =>
                  setEvents([
                    ...events,
                    {
                      ...e,
                      name: `${e.name} Copy`,
                      slug: `${e.slug}-copy`,
                      bookings: 0,
                      status: "Paused",
                    },
                  ])
                }
              >
                Duplicate
              </button>
            </div>
          </article>
        ))}
      </div>
      <AdvancedSuite onCreate={() => setEditing(true)} />
      <CapabilityComparison />
    </section>
  );
}

function AdvancedSuite({ onCreate }: { onCreate: () => void }) {
  const [area, setArea] = useState("Control center"),
    [notice, setNotice] = useState(""),
    [guard, setGuard] = useState(true),
    [routing, setRouting] = useState("Smart load balance"),
    [range, setRange] = useState("30 days");
  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 1900);
  };
  const areas = [
    "Control center",
    "Availability",
    "Automations",
    "Offers & payments",
    "Team & resources",
    "Integrations",
    "Analytics",
  ];
  return (
    <div className="advanced">
      <div className="advancedTitle">
        <div>
          <label>ADVANCED SCHEDULING OS</label>
          <h2>Calendar Command Center</h2>
          <p>
            Every rule, workflow, team member, payment, and customer touchpoint
            in one operating system.
          </p>
        </div>
        <div className="health">
          <i /> All systems operational
        </div>
      </div>
      <div className="advancedNav">
        {areas.map((a) => (
          <button
            className={area === a ? "active" : ""}
            onClick={() => setArea(a)}
            key={a}
          >
            {a}
          </button>
        ))}
      </div>
      {notice && <div className="toast">✓ {notice}</div>}
      {area === "Control center" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>LIVE OPERATIONS</small>
                <h3>Today’s scheduling pulse</h3>
              </div>
              <button onClick={() => flash("Schedule optimized")}>
                Run optimization
              </button>
            </div>
            <div className="pulse">
              <div>
                <b>8</b>
                <span>Confirmed</span>
              </div>
              <div>
                <b>2</b>
                <span>Pending approval</span>
              </div>
              <div>
                <b>3</b>
                <span>Waitlisted</span>
              </div>
              <div>
                <b>94%</b>
                <span>Capacity used</span>
              </div>
            </div>
            <div className="timeline">
              <span>9 AM</span>
              <i style={{ width: "32%" }}>Strategy · Yvette</i>
              <span>11 AM</span>
              <i style={{ width: "50%" }}>AI Intensive · Studio</i>
              <span>2 PM</span>
              <i style={{ width: "40%" }}>Implementation · Chris</i>
            </div>
          </div>
          <div className="suitecard">
            <small>CONFLICT ENGINE</small>
            <h3>Protection active</h3>
            <p>
              2-way calendar sync, resource locks, buffers, travel time, and
              capacity are checked before every confirmation.
            </p>
            <Switch
              label="Smart conflict guard"
              desc="Block unsafe bookings automatically."
              value={guard}
              set={setGuard}
            />
          </div>
          <div className="suitecard">
            <small>QUICK ACTIONS</small>
            <h3>Operate faster</h3>
            <div className="quickgrid">
              <button onClick={onCreate}>＋ New event</button>
              <button onClick={() => flash("Booking created")}>
                ＋ Manual booking
              </button>
              <button onClick={() => flash("Hours overridden")}>
                Override hours
              </button>
              <button onClick={() => flash("Share page copied")}>
                Share booking page
              </button>
            </div>
          </div>
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>EXCEPTIONS</small>
                <h3>Needs your attention</h3>
              </div>
              <b className="redbadge">3 items</b>
            </div>
            {[
              ["Payment retry", "Jordan Blake · $297 deposit", "Resolve"],
              ["Host conflict", "Aug 19 · 1:00 PM", "Reassign"],
              [
                "Waitlist ready",
                "2 seats opened in AI Intensive",
                "Offer seats",
              ],
            ].map((r) => (
              <div className="exception" key={r[0]}>
                <i>!</i>
                <div>
                  <b>{r[0]}</b>
                  <span>{r[1]}</span>
                </div>
                <button onClick={() => flash(`${r[0]} resolved`)}>
                  {r[2]}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {area === "Availability" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>AVAILABILITY ENGINE</small>
                <h3>Layered scheduling rules</h3>
              </div>
              <button onClick={() => flash("Rule added")}>+ Add rule</button>
            </div>
            {[
              [
                "Standard business hours",
                "Mon–Fri · 9:00 AM–5:00 PM",
                "Active",
              ],
              ["VIP evening access", "Tue + Thu · 6:00 PM–8:00 PM", "Priority"],
              ["Holiday blackout", "Dec 23–Jan 2", "Blocked"],
              [
                "Travel protection",
                "45 min before in-person meetings",
                "Active",
              ],
            ].map((r) => (
              <div className="rule" key={r[0]}>
                <span className="drag">⋮⋮</span>
                <div>
                  <b>{r[0]}</b>
                  <small>{r[1]}</small>
                </div>
                <em>{r[2]}</em>
                <button>•••</button>
              </div>
            ))}
          </div>
          <div className="suitecard">
            <small>BOOKING LIMITS</small>
            <h3>Fatigue protection</h3>
            <div className="miniFields">
              <label>
                Meetings per day
                <input defaultValue="6" />
              </label>
              <label>
                Consecutive meetings
                <input defaultValue="3" />
              </label>
              <label>
                Minimum notice
                <select>
                  <option>4 hours</option>
                  <option>24 hours</option>
                </select>
              </label>
              <label>
                Booking horizon
                <select>
                  <option>60 days</option>
                  <option>90 days</option>
                </select>
              </label>
            </div>
          </div>
          <div className="suitecard">
            <small>TIME ZONES</small>
            <h3>Global booking intelligence</h3>
            <p>
              Detect customer time zone, handle daylight saving changes, and
              display host-local availability.
            </p>
            <div className="zone">
              <b>Host</b>
              <span>America/New_York</span>
            </div>
            <div className="zone">
              <b>Visitor</b>
              <span>Auto-detected</span>
            </div>
          </div>
        </div>
      )}
      {area === "Automations" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>WORKFLOW BUILDER</small>
                <h3>Booking journey automation</h3>
              </div>
              <button onClick={() => flash("Workflow step added")}>
                + Add step
              </button>
            </div>
            <div className="flow">
              <div>
                <i>1</i>
                <b>Booking confirmed</b>
                <span>Instantly</span>
              </div>
              <em>→</em>
              <div>
                <i>2</i>
                <b>Email + SMS</b>
                <span>Confirmation</span>
              </div>
              <em>→</em>
              <div>
                <i>3</i>
                <b>Reminder</b>
                <span>24 hours before</span>
              </div>
              <em>→</em>
              <div>
                <i>4</i>
                <b>Follow-up</b>
                <span>2 hours after</span>
              </div>
            </div>
          </div>
          {[
            [
              "No-show rescue",
              "If attendee misses → send rebooking link",
              "82% recovery",
            ],
            [
              "Abandoned booking",
              "If slot selected but not booked → follow up",
              "14 recovered",
            ],
            [
              "VIP preparation",
              "If event value > $2,000 → notify assigned host",
              "Active",
            ],
            [
              "Review request",
              "After completed booking → request feedback",
              "4.9 avg",
            ],
          ].map((x) => (
            <div className="suitecard automation" key={x[0]}>
              <small>AUTOMATION</small>
              <h3>{x[0]}</h3>
              <p>{x[1]}</p>
              <div>
                <em>{x[2]}</em>
                <button onClick={() => flash(`${x[0]} toggled`)}>Active</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {area === "Offers & payments" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>MONETIZATION</small>
                <h3>Offers, packages & subscriptions</h3>
              </div>
              <button onClick={() => flash("Offer builder opened")}>
                + Create offer
              </button>
            </div>
            <div className="offers">
              {[
                ["Executive Access", "5 sessions", "$3,500", "12 sold"],
                [
                  "AI Advisory",
                  "Monthly subscription",
                  "$1,997/mo",
                  "8 active",
                ],
                ["Implementation Day", "Single booking", "$5,000", "4 booked"],
              ].map((o) => (
                <div key={o[0]}>
                  <span>LIVE</span>
                  <h3>{o[0]}</h3>
                  <p>{o[1]}</p>
                  <b>{o[2]}</b>
                  <small>{o[3]}</small>
                  <button>Edit offer</button>
                </div>
              ))}
            </div>
          </div>
          <div className="suitecard">
            <small>PAYMENT RULES</small>
            <h3>Revenue protection</h3>
            {[
              "Stripe checkout",
              "Deposits + balances",
              "Coupons and promo codes",
              "Tax calculation",
              "Refund rules",
              "Failed payment retries",
            ].map((x) => (
              <div className="checkline" key={x}>
                ✓ <span>{x}</span>
              </div>
            ))}
          </div>
          <div className="suitecard">
            <small>REVENUE TODAY</small>
            <h3>$7,291 collected</h3>
            <div className="bar">
              <i style={{ width: "76%" }} />
            </div>
            <p>$2,394 outstanding · 3 scheduled retries</p>
            <button
              className="outline"
              onClick={() => flash("Revenue report opened")}
            >
              View transactions
            </button>
          </div>
        </div>
      )}
      {area === "Team & resources" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>ROUTING ENGINE</small>
                <h3>People and resource assignment</h3>
              </div>
              <select
                value={routing}
                onChange={(e) => setRouting(e.target.value)}
              >
                <option>Smart load balance</option>
                <option>Round robin</option>
                <option>Highest priority</option>
                <option>Collective availability</option>
              </select>
            </div>
            <div className="teamlist">
              {[
                ["YL", "Yvette Lomeli", "6 bookings", "78% utilized"],
                ["CS", "Christopher Sydoriak", "4 bookings", "62% utilized"],
                ["AM", "Amara M.", "2 bookings", "41% utilized"],
              ].map((m, i) => (
                <div key={m[1]}>
                  <i>{m[0]}</i>
                  <b>{m[1]}</b>
                  <span>{m[2]}</span>
                  <div className="bar">
                    <i style={{ width: `${78 - i * 18}%` }} />
                  </div>
                  <small>{m[3]}</small>
                  <button>Manage</button>
                </div>
              ))}
            </div>
          </div>
          <div className="suitecard">
            <small>RESOURCE POOL</small>
            <h3>Rooms & equipment</h3>
            {[
              ["Executive Studio", "Available"],
              ["LED Presentation Wall", "In use until 2 PM"],
              ["Mobile Demo Kit", "Available"],
            ].map((r) => (
              <div className="resource" key={r[0]}>
                <i />
                <div>
                  <b>{r[0]}</b>
                  <small>{r[1]}</small>
                </div>
              </div>
            ))}
            <button className="outline" onClick={() => flash("Resource added")}>
              + Add resource
            </button>
          </div>
          <div className="suitecard">
            <small>COVERAGE</small>
            <h3>Routing health</h3>
            <p>
              All active event types have a primary host, fallback host, and
              required resource coverage.
            </p>
            <b className="score">100%</b>
          </div>
        </div>
      )}
      {area === "Integrations" && (
        <div className="suitegrid integrations">
          {[
            ["Google Calendar", "2-way sync", "Connected"],
            ["Microsoft Outlook", "2-way sync", "Connect"],
            ["Zoom", "Auto-create meetings", "Connected"],
            ["Google Meet", "Auto-create meetings", "Connected"],
            ["Stripe", "Payments + refunds", "Connected"],
            ["HighLevel CRM", "Contacts + pipelines", "Connected"],
            ["Zapier / Make", "Workflow triggers", "Connect"],
            ["Webhooks + API", "Developer access", "Configure"],
          ].map((x) => (
            <div className="suitecard" key={x[0]}>
              <i className="appicon">{x[0].slice(0, 2)}</i>
              <div>
                <h3>{x[0]}</h3>
                <p>{x[1]}</p>
              </div>
              <button
                className={x[2] === "Connected" ? "connected" : ""}
                onClick={() => flash(`${x[0]} settings opened`)}
              >
                {x[2]}
              </button>
            </div>
          ))}
        </div>
      )}
      {area === "Analytics" && (
        <div className="suitegrid">
          <div className="suitecard widecard">
            <div className="cardtitle">
              <div>
                <small>PERFORMANCE</small>
                <h3>Booking intelligence</h3>
              </div>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option>7 days</option>
                <option>30 days</option>
                <option>90 days</option>
              </select>
            </div>
            <div className="analyticsStats">
              {[
                ["Conversion", "68%", "+12.4%"],
                ["Booked revenue", "$42.8K", "+18.2%"],
                ["No-show rate", "3.1%", "-2.4%"],
                ["Avg. lead time", "6.2 days", "+0.8d"],
              ].map((x) => (
                <div key={x[0]}>
                  <small>{x[0]}</small>
                  <b>{x[1]}</b>
                  <em>{x[2]}</em>
                </div>
              ))}
            </div>
            <div className="chart">
              {[38, 54, 42, 66, 58, 82, 74, 91, 77, 94, 88, 100].map((h, i) => (
                <i key={i} style={{ height: `${h}%` }} />
              ))}
              <span>BOOKING VOLUME · {range.toUpperCase()}</span>
            </div>
          </div>
          <div className="suitecard">
            <small>TOP EVENT</small>
            <h3>AI Systems Intensive</h3>
            <b className="score">74%</b>
            <p>Page-to-booking conversion</p>
            <div className="checkline">
              51 <span>visitors converted</span>
            </div>
          </div>
          <div className="suitecard">
            <small>ATTRIBUTION</small>
            <h3>Where bookings start</h3>
            {[
              ["Direct link", "44%"],
              ["Instagram", "28%"],
              ["Email", "18%"],
              ["Partner referral", "10%"],
            ].map((x) => (
              <div className="attribution" key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </div>
            ))}
            <button
              className="outline"
              onClick={() => flash("Analytics exported")}
            >
              Export report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CapabilityComparison() {
  const rows = [
    [
      "Booking links + availability",
      "Native",
      "Native",
      "Native",
      "Native",
      "Native",
    ],
    [
      "Group sessions + capacity",
      "Native",
      "Available",
      "Native",
      "Available",
      "Available",
    ],
    [
      "Waitlists + automatic seat release",
      "Native",
      "Extension",
      "Workflow",
      "Workflow",
      "Manual",
    ],
    [
      "Payments, deposits + packages",
      "Native",
      "Integration",
      "Native",
      "Integration",
      "External",
    ],
    [
      "Attribute + round-robin routing",
      "Native",
      "Teams+",
      "Limited",
      "Org+",
      "Staff logic",
    ],
    [
      "Host + physical resource locking",
      "Native",
      "Host-first",
      "Resources",
      "Host-first",
      "Staff-first",
    ],
    [
      "Customer-selected location or video app",
      "Native",
      "Host-defined",
      "Host-defined",
      "Host-defined",
      "Teams-first",
    ],
    [
      "Reschedule with conflict recheck",
      "Native",
      "Native",
      "Native",
      "Native",
      "Native",
    ],
    [
      "Multi-step email + SMS automation",
      "Native",
      "Plan-based",
      "Available",
      "Plan-based",
      "Email-first",
    ],
    [
      "Contact, booking + attribution record",
      "Unified",
      "Integrations",
      "Client record",
      "Integrations",
      "Microsoft 365",
    ],
    [
      "Month + week operations views",
      "Native",
      "Available",
      "Available",
      "Available",
      "Available",
    ],
    [
      "Custom rules, buffers + blackouts",
      "Native",
      "Available",
      "Available",
      "Available",
      "Available",
    ],
    [
      "White-label brand + interface control",
      "Full control",
      "Partial",
      "Customizable",
      "Plan-based",
      "Limited",
    ],
    [
      "Booking analytics + conversion signals",
      "Native",
      "Plan-based",
      "Reports",
      "Plan-based",
      "Basic",
    ],
  ];
  const tone = (value: string, cyncro: boolean) => {
    if (cyncro) return "matrixBadge matrixBest";
    if (["Native", "Available", "Resources", "Client record"].includes(value))
      return "matrixBadge matrixYes";
    if (["Manual", "External", "Limited", "Basic"].includes(value))
      return "matrixBadge matrixLow";
    return "matrixBadge matrixMid";
  };
  return (
    <section className="comparison" aria-labelledby="comparison-title">
      <div className="comparisonHead">
        <div>
          <label>CAPABILITY BENCHMARK</label>
          <h2 id="comparison-title">More than a scheduling link.</h2>
          <p>
            Cyncro unifies the customer journey, capacity, revenue, routing,
            operations, and follow-up in one calendar operating system.
          </p>
        </div>
        <div className="comparisonCallout">
          <small>CYNCRO ADVANTAGE</small>
          <b>One command center</b>
          <span>No fragmented scheduler stack</span>
        </div>
      </div>
      <div className="capabilityCards">
        {[
          [
            "01",
            "Customer experience",
            "Location choice, custom questions, confirmations",
          ],
          [
            "02",
            "Capacity intelligence",
            "Seats, resources, holds, waitlists, conflict protection",
          ],
          [
            "03",
            "Revenue controls",
            "Payments, deposits, packages, coupons, cancellation rules",
          ],
          [
            "04",
            "Routing engine",
            "Hosts, teams, rooms, equipment, skills, load balancing",
          ],
          [
            "05",
            "Lifecycle automation",
            "Email, SMS, reminders, follow-up, approval paths",
          ],
          [
            "06",
            "Operations + insight",
            "Admin controls, contacts, attribution, conversion analytics",
          ],
        ].map((item) => (
          <article key={item[0]}>
            <span>{item[0]}</span>
            <h3>{item[1]}</h3>
            <p>{item[2]}</p>
          </article>
        ))}
      </div>
      <div className="matrixWrap">
        <table className="capabilityMatrix">
          <thead>
            <tr>
              <th>Capability</th>
              <th className="cyncroColumn">Cyncro</th>
              <th>Calendly</th>
              <th>Acuity</th>
              <th>Cal.com</th>
              <th>MS Bookings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <th scope="row">{row[0]}</th>
                {row.slice(1).map((value, index) => (
                  <td
                    className={index === 0 ? "cyncroColumn" : ""}
                    key={`${row[0]}-${value}-${index}`}
                  >
                    <span className={tone(value, index === 0)}>{value}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="comparisonFoot">
        <p>
          Comparison reflects publicly documented capabilities and typical
          configurations as of August 2026. Plan and integration requirements
          vary.
        </p>
        <div>
          <a
            href="https://calendly.com/features"
            target="_blank"
            rel="noreferrer"
          >
            Calendly
          </a>
          <a
            href="https://help.acuityscheduling.com/hc/en-us/articles/16676870315661-Getting-started-with-Acuity-Scheduling"
            target="_blank"
            rel="noreferrer"
          >
            Acuity
          </a>
          <a href="https://cal.com/pricing" target="_blank" rel="noreferrer">
            Cal.com
          </a>
          <a
            href="https://www.microsoft.com/en-us/microsoft-365/business/scheduling-and-booking-app"
            target="_blank"
            rel="noreferrer"
          >
            Microsoft
          </a>
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <p>{sub}</p>
      {children}
    </div>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "wide" : ""}>
      <span>{label}</span>
      {children}
    </label>
  );
}
function Switch({
  label,
  desc,
  value,
  set,
}: {
  label: string;
  desc: string;
  value: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <div className="switchrow">
      <div>
        <b>{label}</b>
        <p>{desc}</p>
      </div>
      <button
        className={value ? "switch on" : "switch"}
        onClick={() => set(!value)}
      >
        <i />
      </button>
    </div>
  );
}
type CRMView =
  | "Overview"
  | "Pipeline"
  | "Contacts"
  | "Conversations"
  | "Automations"
  | "Intelligence";

const crmContacts = [
  {
    name: "Alexandra Lewis",
    company: "Northstar Advisory",
    email: "alexandra@northstar.co",
    phone: "+1 (561) 555-0121",
    value: "$18,500",
    stage: "Proposal",
    source: "Private booking link",
    intent: 94,
    last: "Booked strategy session",
  },
  {
    name: "Marcus Reed",
    company: "Reed Development",
    email: "marcus@reeddev.com",
    phone: "+1 (305) 555-0184",
    value: "$12,000",
    stage: "Qualified",
    source: "Partner referral",
    intent: 87,
    last: "Replied to SMS",
  },
  {
    name: "Sophia Bennett",
    company: "Atelier House",
    email: "sophia@atelierhouse.com",
    phone: "+1 (786) 555-0148",
    value: "$7,500",
    stage: "Discovery",
    source: "Instagram",
    intent: 76,
    last: "Viewed proposal",
  },
  {
    name: "Daniel Kim",
    company: "Axis Systems",
    email: "daniel@axissystems.ai",
    phone: "+1 (646) 555-0199",
    value: "$32,000",
    stage: "Negotiation",
    source: "Website",
    intent: 91,
    last: "Payment link opened",
  },
  {
    name: "Nia Carter",
    company: "Carter Collective",
    email: "nia@cartercollective.com",
    phone: "+1 (954) 555-0163",
    value: "$5,000",
    stage: "New lead",
    source: "Event registration",
    intent: 68,
    last: "Joined waitlist",
  },
];

function UniversalCRM({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const [view, setView] = useState<CRMView>("Overview"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(0),
    [creating, setCreating] = useState(false),
    [aiOpen, setAiOpen] = useState(false),
    [notice, setNotice] = useState("");
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const filteredContacts = crmContacts.filter((contact) =>
    `${contact.name} ${contact.company} ${contact.email}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const contact = crmContacts[selected];
  const views: { name: CRMView; icon: string; count?: string }[] = [
    { name: "Overview", icon: "⌂" },
    { name: "Pipeline", icon: "◫", count: "$75K" },
    { name: "Contacts", icon: "◎", count: "2.4K" },
    { name: "Conversations", icon: "◇", count: "12" },
    { name: "Automations", icon: "⌁", count: "18" },
    { name: "Intelligence", icon: "✦" },
  ];
  return (
    <section className="crmShell">
      {notice && <div className="crmToast">✓ {notice}</div>}
      <aside className="crmSidebar">
        <div className="crmWorkspace">
          <span>CM</span>
          <div>
            <b>Cyncro Media</b>
            <small>Universal workspace</small>
          </div>
          <i>⌄</i>
        </div>
        <nav className="crmNav" aria-label="CRM navigation">
          <small>REVENUE OPERATING SYSTEM</small>
          {views.map((item) => (
            <button
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
              key={item.name}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.count && <em>{item.count}</em>}
            </button>
          ))}
          <small>CONNECTED SYSTEMS</small>
          <button onClick={onOpenCalendar}>
            <i>□</i>
            <span>Calendar</span>
            <em className="liveDot">Live</em>
          </button>
          <button onClick={() => flash("Payments opened")}>
            <i>◇</i>
            <span>Payments</span>
            <em>$12.9K</em>
          </button>
          <button onClick={() => flash("Analytics opened")}>
            <i>⌁</i>
            <span>Attribution</span>
          </button>
        </nav>
        <button className="crmAgent" onClick={() => setAiOpen(true)}>
          <span>✦</span>
          <div>
            <small>CYNCRO INTELLIGENCE</small>
            <b>Ask your business</b>
          </div>
          <i>↗</i>
        </button>
        <div className="crmUser">
          <span>YL</span>
          <div>
            <b>Yvette Lomeli</b>
            <small>Founder · Admin</small>
          </div>
          <i>•••</i>
        </div>
      </aside>

      <main className="crmMain">
        <header className="crmTopbar">
          <div className="universalSearch">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search any contact, company, deal, message, or booking…"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="crmIconButton"
            onClick={() => flash("No new alerts")}
          >
            ◌<i />
          </button>
          <button className="crmCreate" onClick={() => setCreating(true)}>
            ＋ New record
          </button>
        </header>

        <div className="crmContent">
          <div className="crmPageHead">
            <div>
              <label>UNIVERSAL CRM</label>
              <h1>{view === "Overview" ? "Good afternoon, Yvette." : view}</h1>
              <p>
                {view === "Overview"
                  ? "Every customer signal, opportunity, and next move—organized in real time."
                  : `Manage ${view.toLowerCase()} from one connected customer record.`}
              </p>
            </div>
            <div className="crmDate">
              <small>LIVE WORKSPACE</small>
              <b>August 13, 2026</b>
              <span>● All systems operational</span>
            </div>
          </div>

          {view === "Overview" && (
            <>
              <div className="crmMetrics">
                {[
                  [
                    "OPEN PIPELINE",
                    "$75,000",
                    "+18.4%",
                    "Across 14 opportunities",
                  ],
                  ["WEIGHTED FORECAST", "$48,250", "+$7.8K", "This quarter"],
                  ["ACTIVE CONTACTS", "2,418", "+126", "Last 30 days"],
                  ["CONVERSION", "31.8%", "+4.2%", "Qualified to closed"],
                ].map((metric) => (
                  <article key={metric[0]}>
                    <small>{metric[0]}</small>
                    <div>
                      <b>{metric[1]}</b>
                      <span>{metric[2]}</span>
                    </div>
                    <p>{metric[3]}</p>
                  </article>
                ))}
              </div>
              <div className="crmOverviewGrid">
                <article className="crmPanel crmForecast">
                  <div className="crmPanelHead">
                    <div>
                      <small>REVENUE INTELLIGENCE</small>
                      <h2>Pipeline momentum</h2>
                    </div>
                    <button onClick={() => setView("Pipeline")}>
                      View pipeline →
                    </button>
                  </div>
                  <div className="forecastHero">
                    <div>
                      <small>FORECASTED TO CLOSE</small>
                      <b>$48,250</b>
                      <span>64.3% of open pipeline</span>
                    </div>
                    <div className="forecastRing">
                      <b>78</b>
                      <small>HEALTH</small>
                    </div>
                  </div>
                  <div className="forecastBars">
                    {[
                      ["New", 28, "$8K"],
                      ["Qualified", 47, "$15K"],
                      ["Proposal", 72, "$20K"],
                      ["Negotiation", 90, "$32K"],
                    ].map((item) => (
                      <div key={item[0]}>
                        <span>{item[0]}</span>
                        <i>
                          <b style={{ width: `${item[1]}%` }} />
                        </i>
                        <em>{item[2]}</em>
                      </div>
                    ))}
                  </div>
                </article>
                <article className="crmPanel aiBrief">
                  <div className="aiBriefHead">
                    <span>✦</span>
                    <div>
                      <small>CYNCRO INTELLIGENCE</small>
                      <h2>Your daily brief</h2>
                    </div>
                    <i>LIVE</i>
                  </div>
                  <p>Three actions are most likely to create revenue today.</p>
                  {[
                    [
                      "01",
                      "Follow up with Daniel Kim",
                      "Payment intent increased after opening the proposal twice.",
                      "$32K",
                    ],
                    [
                      "02",
                      "Protect Alexandra’s momentum",
                      "Her strategy session is tomorrow; send the executive brief.",
                      "$18.5K",
                    ],
                    [
                      "03",
                      "Move Marcus to proposal",
                      "All qualification criteria are complete.",
                      "$12K",
                    ],
                  ].map((item) => (
                    <button
                      onClick={() => flash(`${item[1]} queued`)}
                      key={item[0]}
                    >
                      <span>{item[0]}</span>
                      <div>
                        <b>{item[1]}</b>
                        <small>{item[2]}</small>
                      </div>
                      <em>{item[3]}</em>
                    </button>
                  ))}
                  <button className="askAi" onClick={() => setAiOpen(true)}>
                    Ask Cyncro anything <span>↗</span>
                  </button>
                </article>
                <article className="crmPanel crmActivity">
                  <div className="crmPanelHead">
                    <div>
                      <small>LIVE CUSTOMER SIGNALS</small>
                      <h2>What just happened</h2>
                    </div>
                    <button onClick={() => setView("Conversations")}>
                      All activity →
                    </button>
                  </div>
                  {[
                    [
                      "BK",
                      "Alexandra booked a strategy session",
                      "Calendar · 4 min ago",
                      "+ Opportunity updated",
                    ],
                    [
                      "$",
                      "Daniel opened the $32K payment link",
                      "Payments · 18 min ago",
                      "High intent",
                    ],
                    [
                      "✉",
                      "Marcus replied: “Let’s move forward”",
                      "SMS · 32 min ago",
                      "Reply needed",
                    ],
                    [
                      "◎",
                      "Sophia viewed the proposal again",
                      "Tracking · 1 hr ago",
                      "3 total views",
                    ],
                  ].map((item) => (
                    <div className="activityRow" key={item[1]}>
                      <i>{item[0]}</i>
                      <div>
                        <b>{item[1]}</b>
                        <small>{item[2]}</small>
                      </div>
                      <span>{item[3]}</span>
                    </div>
                  ))}
                </article>
                <article className="crmPanel crmAgenda">
                  <div className="crmPanelHead">
                    <div>
                      <small>CALENDAR + TASKS</small>
                      <h2>Next on your desk</h2>
                    </div>
                    <button onClick={onOpenCalendar}>Open calendar →</button>
                  </div>
                  {[
                    [
                      "1:00",
                      "Executive Strategy Session",
                      "Alexandra Lewis · Video",
                    ],
                    ["2:30", "Proposal follow-up", "Marcus Reed · Task"],
                    ["4:00", "AI Systems Intensive", "9 attendees · Studio A"],
                  ].map((item) => (
                    <div className="agendaRow" key={item[0]}>
                      <time>
                        {item[0]}
                        <small>PM</small>
                      </time>
                      <i />
                      <div>
                        <b>{item[1]}</b>
                        <small>{item[2]}</small>
                      </div>
                      <button onClick={() => flash("Record opened")}>
                        •••
                      </button>
                    </div>
                  ))}
                </article>
              </div>
            </>
          )}

          {view === "Pipeline" && <CRMPipeline onFlash={flash} />}
          {view === "Contacts" && (
            <div className="contactWorkspace">
              <div className="contactList crmPanel">
                <div className="listToolbar">
                  <span>{filteredContacts.length} contacts</span>
                  <div>
                    <button onClick={() => flash("Filters opened")}>
                      Filter
                    </button>
                    <button onClick={() => flash("View changed")}>
                      Columns
                    </button>
                  </div>
                </div>
                <div className="contactTableHead">
                  <span>CONTACT</span>
                  <span>STAGE</span>
                  <span>VALUE</span>
                  <span>INTENT</span>
                </div>
                {filteredContacts.map((item) => {
                  const originalIndex = crmContacts.indexOf(item);
                  return (
                    <button
                      className={`contactRow ${selected === originalIndex ? "active" : ""}`}
                      onClick={() => setSelected(originalIndex)}
                      key={item.email}
                    >
                      <span>
                        <i>
                          {item.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </i>
                        <div>
                          <b>{item.name}</b>
                          <small>{item.company}</small>
                        </div>
                      </span>
                      <em>{item.stage}</em>
                      <strong>{item.value}</strong>
                      <span className="intentScore">{item.intent}</span>
                    </button>
                  );
                })}
              </div>
              <CRMContactDetail contact={contact} onFlash={flash} />
            </div>
          )}
          {view === "Conversations" && <CRMConversations onFlash={flash} />}
          {view === "Automations" && <CRMAutomations onFlash={flash} />}
          {view === "Intelligence" && <CRMIntelligence onFlash={flash} />}
        </div>
      </main>

      {creating && (
        <div className="crmModalBack" onClick={() => setCreating(false)}>
          <div
            className="crmModal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="crmModalHead">
              <div>
                <label>CREATE ANYTHING</label>
                <h2>New universal record</h2>
              </div>
              <button onClick={() => setCreating(false)}>×</button>
            </div>
            <div className="recordTypes">
              {["Contact", "Company", "Opportunity", "Task", "Note"].map(
                (item, index) => (
                  <button className={index === 0 ? "active" : ""} key={item}>
                    {item}
                  </button>
                ),
              )}
            </div>
            <div className="crmForm">
              <label>
                Full name
                <input placeholder="Enter contact name" />
              </label>
              <label>
                Company
                <input placeholder="Company or organization" />
              </label>
              <label>
                Email
                <input placeholder="name@company.com" />
              </label>
              <label>
                Phone
                <input placeholder="(000) 000-0000" />
              </label>
              <label>
                Source
                <select>
                  <option>Booking link</option>
                  <option>Website</option>
                  <option>Referral</option>
                  <option>Manual</option>
                </select>
              </label>
              <label>
                Lifecycle
                <select>
                  <option>Lead</option>
                  <option>Qualified</option>
                  <option>Customer</option>
                </select>
              </label>
            </div>
            <div className="crmModalActions">
              <button onClick={() => setCreating(false)}>Cancel</button>
              <button
                onClick={() => {
                  setCreating(false);
                  flash("Contact created and enriched");
                }}
              >
                Create + enrich record
              </button>
            </div>
          </div>
        </div>
      )}
      {aiOpen && (
        <div className="aiDrawer">
          <div className="aiDrawerHead">
            <div>
              <span>✦</span>
              <div>
                <small>CYNCRO INTELLIGENCE</small>
                <b>Business command</b>
              </div>
            </div>
            <button onClick={() => setAiOpen(false)}>×</button>
          </div>
          <div className="aiConversation">
            <div className="aiPrompt">What needs my attention today?</div>
            <div className="aiAnswer">
              <span>✦</span>
              <p>
                You have <b>$62,500</b> in high-intent opportunities. Daniel Kim
                should be contacted first; his payment activity makes him 3.2×
                more likely to close today. I can draft the message, create the
                task, and update the opportunity.
              </p>
            </div>
          </div>
          <div className="aiSuggestions">
            {[
              "Draft Daniel’s follow-up",
              "Show at-risk deals",
              "Build today’s call list",
            ].map((item) => (
              <button onClick={() => flash(`${item} · ready`)} key={item}>
                {item}
              </button>
            ))}
          </div>
          <div className="aiComposer">
            <input placeholder="Ask about any contact, deal, booking, or metric…" />
            <button onClick={() => flash("Command processed")}>↑</button>
          </div>
          <small className="aiPermission">
            Cyncro asks before taking external actions.
          </small>
        </div>
      )}
    </section>
  );
}

function CRMPipeline({ onFlash }: { onFlash: (message: string) => void }) {
  const columns = [
    [
      "NEW LEAD",
      "$8,000",
      [
        ["Nia Carter", "Carter Collective", "$5,000", "68"],
        ["Elena Torres", "Torres Studio", "$3,000", "61"],
      ],
    ],
    [
      "QUALIFIED",
      "$15,000",
      [
        ["Marcus Reed", "Reed Development", "$12,000", "87"],
        ["Owen Hart", "Hart & Co.", "$3,000", "72"],
      ],
    ],
    [
      "PROPOSAL",
      "$20,500",
      [
        ["Alexandra Lewis", "Northstar Advisory", "$18,500", "94"],
        ["Sophia Bennett", "Atelier House", "$2,000", "76"],
      ],
    ],
    [
      "NEGOTIATION",
      "$32,000",
      [["Daniel Kim", "Axis Systems", "$32,000", "91"]],
    ],
    [
      "CLOSED WON",
      "$24,000",
      [
        ["Maya Brooks", "Studio M", "$14,000", "100"],
        ["Leo Grant", "Grant Capital", "$10,000", "100"],
      ],
    ],
  ] as const;
  return (
    <div className="pipelineBoard">
      {columns.map((column) => (
        <section key={column[0]}>
          <header>
            <div>
              <small>{column[0]}</small>
              <b>{column[1]}</b>
            </div>
            <span>{column[2].length}</span>
          </header>
          <div>
            {column[2].map((deal) => (
              <button
                className="dealCard"
                onClick={() => onFlash(`${deal[0]} opened`)}
                key={deal[0]}
              >
                <div>
                  <i>
                    {deal[0]
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </i>
                  <span>
                    <b>{deal[0]}</b>
                    <small>{deal[1]}</small>
                  </span>
                </div>
                <strong>{deal[2]}</strong>
                <footer>
                  <span>Intent {deal[3]}</span>
                  <em>•••</em>
                </footer>
              </button>
            ))}
          </div>
          <button
            className="addDeal"
            onClick={() =>
              onFlash(`New ${column[0].toLowerCase()} opportunity`)
            }
          >
            ＋ Add opportunity
          </button>
        </section>
      ))}
    </div>
  );
}

function CRMContactDetail({
  contact,
  onFlash,
}: {
  contact: (typeof crmContacts)[number];
  onFlash: (message: string) => void;
}) {
  return (
    <aside className="contactDetail crmPanel">
      <div className="contactHero">
        <i>
          {contact.name
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </i>
        <div>
          <small>UNIFIED CUSTOMER RECORD</small>
          <h2>{contact.name}</h2>
          <p>{contact.company}</p>
        </div>
        <span>{contact.intent} intent</span>
      </div>
      <div className="contactActions">
        <button onClick={() => onFlash("Call started")}>Call</button>
        <button onClick={() => onFlash("Email composer opened")}>Email</button>
        <button onClick={() => onFlash("SMS composer opened")}>SMS</button>
        <button onClick={() => onFlash("Meeting link opened")}>Book</button>
      </div>
      <div className="contactFacts">
        {[
          ["EMAIL", contact.email],
          ["PHONE", contact.phone],
          ["LIFECYCLE", contact.stage],
          ["OPPORTUNITY", contact.value],
          ["SOURCE", contact.source],
          ["OWNER", "Yvette Lomeli"],
        ].map((item) => (
          <div key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
          </div>
        ))}
      </div>
      <div className="contactTimeline">
        <div className="crmPanelHead">
          <div>
            <small>COMPLETE TIMELINE</small>
            <h3>Every interaction</h3>
          </div>
          <button onClick={() => onFlash("Note composer opened")}>
            ＋ Note
          </button>
        </div>
        {[
          ["NOW", contact.last, "Customer signal"],
          ["YESTERDAY", "Confirmation email delivered", "Automation"],
          ["AUG 11", "Executive Strategy Session booked", "Calendar"],
          ["AUG 10", `Entered from ${contact.source}`, "Attribution"],
        ].map((item) => (
          <div key={item[0] + item[1]}>
            <time>{item[0]}</time>
            <i />
            <span>
              <b>{item[1]}</b>
              <small>{item[2]}</small>
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function CRMConversations({ onFlash }: { onFlash: (message: string) => void }) {
  const [thread, setThread] = useState(0);
  const threads = [
    [
      "Marcus Reed",
      "Let’s move forward. What do you need from me?",
      "SMS",
      "2m",
    ],
    [
      "Alexandra Lewis",
      "Confirmed—looking forward to tomorrow.",
      "Email",
      "18m",
    ],
    ["Sophia Bennett", "Can we add a second location?", "Instagram", "1h"],
    ["Nia Carter", "A seat opened for the intensive.", "Automation", "2h"],
  ];
  return (
    <div className="conversationWorkspace crmPanel">
      <aside>
        <div className="inboxHead">
          <div>
            <small>UNIFIED INBOX</small>
            <h2>All conversations</h2>
          </div>
          <button onClick={() => onFlash("Inbox filters opened")}>⌁</button>
        </div>
        {threads.map((item, index) => (
          <button
            className={thread === index ? "active" : ""}
            onClick={() => setThread(index)}
            key={item[0]}
          >
            <i>
              {item[0]
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </i>
            <div>
              <b>{item[0]}</b>
              <p>{item[1]}</p>
              <small>{item[2]}</small>
            </div>
            <time>{item[3]}</time>
          </button>
        ))}
      </aside>
      <article>
        <header>
          <div>
            <i>
              {threads[thread][0]
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </i>
            <span>
              <b>{threads[thread][0]}</b>
              <small>Opportunity · Qualified · $12,000</small>
            </span>
          </div>
          <div>
            <button onClick={() => onFlash("Call started")}>Call</button>
            <button onClick={() => onFlash("Contact opened")}>
              Open record
            </button>
          </div>
        </header>
        <div className="messageCanvas">
          <div className="messageDate">TODAY</div>
          <div className="message inbound">
            Hi Yvette, I reviewed everything with my team.
          </div>
          <div className="message inbound">{threads[thread][1]}</div>
          <div className="message outbound">
            Absolutely—I’ll prepare the next step and send it over today.
          </div>
        </div>
        <footer>
          <button>＋</button>
          <input placeholder="Reply by SMS…" />
          <button onClick={() => onFlash("Reply sent")}>Send ↑</button>
        </footer>
      </article>
      <aside className="conversationContext">
        <small>CONVERSATION INTELLIGENCE</small>
        <div className="sentiment">
          <span>↗</span>
          <div>
            <b>High buying intent</b>
            <small>Positive sentiment · Decision language detected</small>
          </div>
        </div>
        <h3>Suggested next move</h3>
        <p>
          Send the proposal and payment link, then create a 24-hour follow-up
          task.
        </p>
        <button onClick={() => onFlash("Next move executed")}>
          ✦ Execute next move
        </button>
      </aside>
    </div>
  );
}

function CRMAutomations({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="automationWorkspace">
      <div className="automationSummary">
        {[
          ["18", "ACTIVE SYSTEMS"],
          ["4,286", "ACTIONS THIS MONTH"],
          ["96.8%", "SUCCESS RATE"],
          ["132 hrs", "TIME RETURNED"],
        ].map((item) => (
          <div key={item[1]}>
            <b>{item[0]}</b>
            <small>{item[1]}</small>
          </div>
        ))}
      </div>
      <div className="automationGrid">
        {[
          [
            "Booking → Opportunity",
            "When a qualified booking is created, enrich the contact, open an opportunity, and assign the correct owner.",
            "1,248 runs",
            "LIVE",
          ],
          [
            "No-show recovery",
            "Send a recovery sequence, reopen availability, and notify the owner when a customer rebooks.",
            "184 runs",
            "LIVE",
          ],
          [
            "High-intent escalation",
            "Detect proposal views, payment activity, and decision language—then create the next best action.",
            "96 runs",
            "LIVE",
          ],
          [
            "Customer onboarding",
            "After payment, create tasks, collect documents, book kickoff, and move the lifecycle stage.",
            "72 runs",
            "LIVE",
          ],
          [
            "Waitlist conversion",
            "Fill cancelled seats automatically and stop the sequence when capacity is restored.",
            "318 runs",
            "LIVE",
          ],
          [
            "Reactivation engine",
            "Identify dormant contacts with buying signals and launch a personalized re-engagement path.",
            "Ready",
            "DRAFT",
          ],
        ].map((item, index) => (
          <article className="crmPanel" key={item[0]}>
            <header>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <i className={item[3] === "LIVE" ? "on" : ""}>{item[3]}</i>
            </header>
            <h2>{item[0]}</h2>
            <p>{item[1]}</p>
            <footer>
              <small>{item[2]}</small>
              <button onClick={() => onFlash(`${item[0]} opened`)}>
                Open system →
              </button>
            </footer>
          </article>
        ))}
      </div>
      <button
        className="newAutomation"
        onClick={() => onFlash("Automation builder opened")}
      >
        ＋ Build a new operating system
      </button>
    </div>
  );
}
function CRMIntelligence({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="intelligenceWorkspace">
      <section className="intelligenceHero">
        <div>
          <span>✦ CYNCRO INTELLIGENCE</span>
          <h2>
            Ask your entire business.
            <br />
            Act from one answer.
          </h2>
          <p>
            Reason across contacts, bookings, conversations, revenue, payments,
            tasks, and attribution—then execute with permission.
          </p>
          <div>
            <button onClick={() => onFlash("Revenue analysis ready")}>
              Why did revenue change?
            </button>
            <button onClick={() => onFlash("At-risk deals identified")}>
              Which deals are at risk?
            </button>
            <button onClick={() => onFlash("Growth plan generated")}>
              Build my growth plan
            </button>
          </div>
        </div>
        <aside>
          <small>LIVE BUSINESS MODEL</small>
          {[
            ["Customer graph", "2,418 entities"],
            ["Revenue context", "$284K analyzed"],
            ["Behavior signals", "12,806 events"],
            ["Connected actions", "34 capabilities"],
          ].map((item) => (
            <div key={item[0]}>
              <span>{item[0]}</span>
              <b>{item[1]}</b>
              <i>●</i>
            </div>
          ))}
        </aside>
      </section>
      <div className="intelligenceCards">
        {[
          [
            "NEXT-BEST ACTION",
            "Prioritize the seven contacts most likely to close this week.",
            "+$54K influenced",
          ],
          [
            "PIPELINE RISK",
            "Two opportunities show declining engagement and need intervention.",
            "$9.5K protected",
          ],
          [
            "CAPACITY SIGNAL",
            "Friday’s intensive can release two held seats to the waitlist.",
            "+$1,994 potential",
          ],
          [
            "ATTRIBUTION INSIGHT",
            "Private booking links convert 2.7× better than paid traffic.",
            "Shift budget",
          ],
        ].map((item) => (
          <article className="crmPanel" key={item[0]}>
            <small>{item[0]}</small>
            <h3>{item[1]}</h3>
            <b>{item[2]}</b>
            <button onClick={() => onFlash("Insight opened")}>
              Inspect reasoning →
            </button>
          </article>
        ))}
      </div>
      <section className="enterpriseLayer crmPanel">
        <div className="enterpriseLayerHead">
          <div>
            <small>ENTERPRISE CONTROL LAYER</small>
            <h2>Salesforce depth. Cyncro speed.</h2>
            <p>
              Model any business without forcing it into rigid CRM objects or
              requiring a team of administrators.
            </p>
          </div>
          <span>Architecture ready</span>
        </div>
        <div className="enterpriseGrid">
          {[
            [
              "Universal objects",
              "Create any record, field, relationship, or lifecycle.",
            ],
            [
              "Relationship graph",
              "See people, companies, deals, bookings, payments, and influence.",
            ],
            [
              "Permission intelligence",
              "Role, team, field, action, and AI-level controls.",
            ],
            [
              "Multi-pipeline engine",
              "Run sales, service, recruiting, partnerships, and fulfillment.",
            ],
            [
              "Open orchestration",
              "APIs, webhooks, event streams, imports, exports, and data sync.",
            ],
            [
              "Audit + governance",
              "Full history, approvals, ownership, deduplication, and data quality.",
            ],
          ].map((item, index) => (
            <article key={item[0]}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{item[0]}</b>
                <p>{item[1]}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Admin({ onCreate }: { onCreate: () => void }) {
  const [selectedBooking, setSelectedBooking] = useState<number | null>(null);
  const [rows, setRows] = useState([
    [
      "Aug 18 · 9:00 AM",
      "Avery Morgan",
      "Executive Strategy",
      "Google Meet",
      "Confirmed",
    ],
    [
      "Aug 18 · 11:30 AM",
      "Jordan Blake",
      "Private Consultation",
      "In person",
      "Confirmed",
    ],
    [
      "Aug 19 · 1:00 PM",
      "Taylor Brooks",
      "Executive Strategy",
      "Phone",
      "Pending",
    ],
    [
      "Aug 21 · 3:30 PM",
      "Morgan Reed",
      "Systems Intensive",
      "Zoom",
      "Confirmed",
    ],
  ]);
  const updateBooking = (index: number, field: number, value: string) =>
    setRows(
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? row.map((item, itemIndex) => (itemIndex === field ? value : item))
          : row,
      ),
    );
  return (
    <section className="admin">
      <div className="adminhead">
        <div>
          <label>UNIVERSAL CALENDAR</label>
          <h1>Booking management</h1>
          <p>
            Availability, resources, contacts, and scheduling controls in one
            place.
          </p>
        </div>
        <button onClick={onCreate}>+ Create event</button>
      </div>
      <div className="stats">
        {[
          ["BOOKINGS THIS WEEK", "24"],
          ["CONFIRMATION RATE", "96%"],
          ["HOST UTILIZATION", "78%"],
          ["WAITLIST", "6"],
        ].map((x) => (
          <div key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <p>Live backend status</p>
          </div>
        ))}
      </div>
      <div className="table">
        <h3>Upcoming bookings</h3>
        {rows.map((r, i) => (
          <div className="tr" key={i}>
            {r.map((x, j) => (
              <span key={j}>
                <b>{x}</b>
                {j === 1 && (
                  <small>
                    {x.toLowerCase().replace(" ", ".")}@email.com
                    <br />
                    (561) 555-01{i + 20}
                  </small>
                )}
              </span>
            ))}
            <button onClick={() => setSelectedBooking(i)}>•••</button>
          </div>
        ))}
      </div>
      <footer className="features">
        ◆ Double-booking protection　◆ Weighted host routing　◆ Resource
        locking　◆ Automated reminders　◆ Calendar sync ready
      </footer>
      {selectedBooking !== null && (
        <div className="modalback" onClick={() => setSelectedBooking(null)}>
          <div
            className="bookingmodal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalhead">
              <div>
                <label>BOOKING CONTROL</label>
                <h2>{rows[selectedBooking][1]}</h2>
              </div>
              <button onClick={() => setSelectedBooking(null)}>×</button>
            </div>
            <div className="bookingfacts">
              <div>
                <small>DATE & TIME</small>
                <b>{rows[selectedBooking][0]}</b>
              </div>
              <div>
                <small>EVENT</small>
                <b>{rows[selectedBooking][2]}</b>
              </div>
              <div>
                <small>LOCATION</small>
                <b>{rows[selectedBooking][3]}</b>
              </div>
              <div>
                <small>STATUS</small>
                <b>{rows[selectedBooking][4]}</b>
              </div>
            </div>
            <div className="modalactions">
              <button
                onClick={() => {
                  updateBooking(selectedBooking, 0, "Aug 20 · 2:30 PM");
                  setSelectedBooking(null);
                }}
              >
                Reschedule
              </button>
              <button
                onClick={() => {
                  updateBooking(selectedBooking, 4, "Confirmed");
                  setSelectedBooking(null);
                }}
              >
                Confirm
              </button>
              <button
                className="danger"
                onClick={() => {
                  updateBooking(selectedBooking, 4, "Cancelled");
                  setSelectedBooking(null);
                }}
              >
                Cancel booking
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
