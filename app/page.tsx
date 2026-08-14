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
type Tab =
  | "home"
  | "book"
  | "admin"
  | "studio"
  | "crm"
  | "dispatch"
  | "dispute"
  | "finance";
export default function Home() {
  const [tab, setTab] = useState<Tab>("home"),
    [lightMode, setLightMode] = useState(false),
    [step, setStep] = useState(1),
    [location, setLocation] = useState(""),
    [time, setTime] = useState(""),
    [view, setView] = useState("Month"),
    [date, setDate] = useState(18);
  return (
    <main
      className={`cyncroApp readable ${lightMode ? "themeLight" : "themeDark"}`}
    >
      <header className={tab === "home" ? "frontHeader" : ""}>
        <button className="logo logoButton" onClick={() => setTab("home")}>
          <i>Cyncro</i> Core
        </button>
        <nav>
          {[
            ["home", "Overview"],
            ["book", "Booking experience"],
            ["studio", "Core Studio"],
            ["crm", "Cyncro CRM"],
            ["dispatch", "Dispatch"],
            ["dispute", "Dispute"],
            ["finance", "Finance"],
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
          <button
            className="themeSwitch"
            onClick={() => setLightMode(!lightMode)}
            aria-label={`Switch to ${lightMode ? "dark" : "light"} theme`}
          >
            <i>{lightMode ? "◐" : "☀"}</i>
            {lightMode ? "Dark" : "Light"}
          </button>
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
      ) : tab === "dispatch" ? (
        <CyncroDispatch />
      ) : tab === "dispute" ? (
        <CyncroDispute />
      ) : tab === "finance" ? (
        <CyncroFinance />
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
type DisputeView =
  | "Command"
  | "Clients"
  | "Leads"
  | "Report Audit"
  | "Cases"
  | "Templates"
  | "Law Library"
  | "Mail"
  | "Inbox"
  | "Tasks"
  | "Billing"
  | "Affiliates"
  | "Client Portal"
  | "Team"
  | "Marketing"
  | "Analytics"
  | "Compliance";

const disputeCases = [
  {
    client: "Amelia Carter",
    item: "Capital One · ending 4412",
    bureau: "Experian",
    issue: "Balance inaccurate",
    round: 1,
    due: "Sep 11",
    status: "INVESTIGATING",
    score: 82,
  },
  {
    client: "Marcus Reed",
    item: "Midland Credit Management",
    bureau: "TransUnion",
    issue: "Not my account",
    round: 2,
    due: "Aug 29",
    status: "RESPONSE DUE",
    score: 94,
  },
  {
    client: "Sofia Bennett",
    item: "Chase · ending 1098",
    bureau: "Equifax",
    issue: "Late payment inaccurate",
    round: 1,
    due: "Sep 08",
    status: "MAILED",
    score: 76,
  },
  {
    client: "Daniel Foster",
    item: "Portfolio Recovery",
    bureau: "All bureaus",
    issue: "Date/status mismatch",
    round: 3,
    due: "Aug 22",
    status: "ESCALATE",
    score: 89,
  },
];

function CyncroDispute() {
  const [view, setView] = useState<DisputeView>("Command");
  const [selectedCase, setSelectedCase] = useState(1);
  const [notice, setNotice] = useState("");
  const [template, setTemplate] = useState(
    "CRA factual dispute — inaccurate account data",
  );
  const [generated, setGenerated] = useState(false);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1900);
  };
  const nav: { name: DisputeView; icon: string }[] = [
    { name: "Command", icon: "⌂" },
    { name: "Clients", icon: "◎" },
    { name: "Leads", icon: "◫" },
    { name: "Report Audit", icon: "◉" },
    { name: "Cases", icon: "▦" },
    { name: "Templates", icon: "▤" },
    { name: "Law Library", icon: "§" },
    { name: "Mail", icon: "✉" },
    { name: "Inbox", icon: "▣" },
    { name: "Tasks", icon: "✓" },
    { name: "Billing", icon: "$" },
    { name: "Affiliates", icon: "⌘" },
    { name: "Client Portal", icon: "▱" },
    { name: "Team", icon: "♙" },
    { name: "Marketing", icon: "✦" },
    { name: "Analytics", icon: "⌁" },
    { name: "Compliance", icon: "◇" },
  ];
  return (
    <section className="disputeShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      <aside className="disputeSidebar">
        <div className="disputeBrand">
          <span>CD</span>
          <div>
            <b>Cyncro Dispute</b>
            <small>Factual dispute operations</small>
          </div>
        </div>
        <div className="disputeWorkspace">
          <small>ACTIVE ORGANIZATION</small>
          <button>
            <span>VP</span>
            <div>
              <b>Vivid Pinnacle</b>
              <small>Administrator</small>
            </div>
            <i>⌄</i>
          </button>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
              key={item.name}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.name === "Cases" && <em>24</em>}
            </button>
          ))}
        </nav>
        <div className="disputeGuard">
          <span>COMPLIANCE GUARD</span>
          <b>● Active</b>
          <small>CROA disclosures · truth attestation · audit log</small>
        </div>
        <button
          className="exitDispute"
          onClick={() => flash("Workspace switcher opened")}
        >
          Cyncro Core modules ↗
        </button>
      </aside>
      <main className="disputeMain">
        <header className="disputeTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Command" ? "Dispute Command Center" : view}</b>
          </div>
          <div>
            <button onClick={() => flash("Global search opened")}>⌕</button>
            <button onClick={() => flash("No compliance alerts")}>◌</button>
            <button
              onClick={() => {
                setView("Cases");
                flash("New factual dispute case opened");
              }}
            >
              ＋ New case
            </button>
          </div>
        </header>
        <div className="disputeContent">
          {view === "Command" && (
            <DisputeCommand onView={setView} onFlash={flash} />
          )}
          {view === "Cases" && (
            <DisputeCases
              selected={selectedCase}
              setSelected={setSelectedCase}
              onFlash={flash}
            />
          )}
          {view === "Clients" && (
            <DisputeClients onCase={() => setView("Cases")} onFlash={flash} />
          )}
          {view === "Leads" && <DisputeLeads onFlash={flash} />}
          {view === "Report Audit" && <DisputeReportAudit onFlash={flash} />}
          {view === "Templates" && (
            <DisputeTemplates
              template={template}
              setTemplate={setTemplate}
              generated={generated}
              setGenerated={setGenerated}
              onFlash={flash}
            />
          )}
          {view === "Law Library" && <DisputeLawLibrary />}
          {view === "Mail" && <DisputeMail onFlash={flash} />}
          {view === "Inbox" && <DisputeInbox onFlash={flash} />}
          {view === "Tasks" && <DisputeTasks onFlash={flash} />}
          {view === "Billing" && <DisputeBilling onFlash={flash} />}
          {view === "Affiliates" && <DisputeAffiliates onFlash={flash} />}
          {view === "Client Portal" && <DisputeClientPortal onFlash={flash} />}
          {view === "Team" && <DisputeTeam onFlash={flash} />}
          {view === "Marketing" && <DisputeMarketing onFlash={flash} />}
          {view === "Analytics" && <DisputeAnalytics />}
          {view === "Compliance" && <DisputeCompliance onFlash={flash} />}
        </div>
      </main>
    </section>
  );
}

function DisputeCommand({
  onView,
  onFlash,
}: {
  onView: (view: DisputeView) => void;
  onFlash: (message: string) => void;
}) {
  return (
    <>
      <div className="disputeHero">
        <div>
          <span>CONSUMER REPORT ACCURACY OPERATIONS</span>
          <h1>
            Every fact tracked.
            <br />
            <i>Every deadline protected.</i>
          </h1>
          <p>
            Evidence-led dispute management with bureau rounds, furnisher
            investigations, certified mail, response analysis, and compliance
            controls.
          </p>
        </div>
        <button onClick={() => onView("Templates")}>
          ✦ Build compliant dispute
        </button>
      </div>
      <div className="disputeMetrics">
        {[
          ["ACTIVE CLIENTS", "184", "+12 this month"],
          ["OPEN DISPUTES", "327", "24 responses due"],
          ["ITEMS CORRECTED", "68%", "Verified outcomes"],
          ["DEADLINES PROTECTED", "100%", "0 overdue"],
        ].map((m) => (
          <article key={m[0]}>
            <small>{m[0]}</small>
            <b>{m[1]}</b>
            <span>{m[2]}</span>
          </article>
        ))}
      </div>
      <div className="disputeCommandGrid">
        <section className="disputePanel casePulse">
          <header>
            <div>
              <small>PRIORITY CASES</small>
              <h2>What needs action now</h2>
            </div>
            <button onClick={() => onView("Cases")}>All cases →</button>
          </header>
          {disputeCases.map((c, i) => (
            <button onClick={() => onView("Cases")} key={c.client}>
              <span>
                <i>
                  {c.client
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </i>
                <div>
                  <b>{c.client}</b>
                  <small>
                    {c.item} · {c.bureau}
                  </small>
                </div>
              </span>
              <em>{c.issue}</em>
              <strong>{c.status}</strong>
              <time>{c.due}</time>
            </button>
          ))}
        </section>
        <section className="disputePanel deadlineRadar">
          <small>STATUTORY DEADLINE RADAR</small>
          <h2>Investigation clock</h2>
          <div className="deadlineRing">
            <span>
              <b>24</b>
              <small>RESPONSES DUE</small>
            </span>
          </div>
          {[
            ["0–7 days", "5", "urgent"],
            ["8–15 days", "8", "watch"],
            ["16–30 days", "11", "safe"],
          ].map((x) => (
            <article key={x[0]}>
              <i className={x[2]} />
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </article>
          ))}
          <button onClick={() => onView("Mail")}>
            Open deadline command →
          </button>
        </section>
        <section className="disputePanel evidenceHealth">
          <header>
            <div>
              <small>EVIDENCE READINESS</small>
              <h2>Case strength before submission</h2>
            </div>
            <span>86% avg</span>
          </header>
          {[
            ["Identity + address verified", "100%"],
            ["Report page attached", "92%"],
            ["Specific factual allegation", "88%"],
            ["Supporting documents", "76%"],
            ["Requested correction stated", "94%"],
          ].map((x) => (
            <article key={x[0]}>
              <span>{x[0]}</span>
              <em>
                <i style={{ width: x[1] }} />
              </em>
              <b>{x[1]}</b>
            </article>
          ))}
        </section>
        <section className="disputePanel compliancePulse">
          <small>COMPLIANCE PULSE</small>
          <h2>Built to protect the consumer and the company.</h2>
          <div>
            <span>✓ No advance-fee workflow</span>
            <span>✓ Three-day cancellation tracked</span>
            <span>✓ Truth attestation required</span>
            <span>✓ No blanket disputes</span>
            <span>✓ No false identity-theft claims</span>
            <span>✓ Immutable activity record</span>
          </div>
          <button onClick={() => onView("Compliance")}>
            Open compliance center →
          </button>
        </section>
      </div>
    </>
  );
}

function DisputeCases({
  selected,
  setSelected,
  onFlash,
}: {
  selected: number;
  setSelected: (n: number) => void;
  onFlash: (m: string) => void;
}) {
  const c = disputeCases[selected];
  return (
    <div className="disputeCases">
      <section className="disputePanel disputeCaseList">
        <header>
          <div>
            <small>CASE COMMAND</small>
            <h1>Active disputes</h1>
          </div>
          <button onClick={() => onFlash("Case filters opened")}>Filter</button>
        </header>
        {disputeCases.map((x, i) => (
          <button
            className={selected === i ? "active" : ""}
            onClick={() => setSelected(i)}
            key={x.client}
          >
            <span>
              <b>{x.client}</b>
              <small>
                {x.item}
                <br />
                {x.bureau} · Round {x.round}
              </small>
            </span>
            <em>{x.status}</em>
            <strong>{x.score}%</strong>
          </button>
        ))}
      </section>
      <aside className="disputePanel disputeInspector">
        <header>
          <div>
            <small>CASE FILE</small>
            <h2>{c.client}</h2>
          </div>
          <button onClick={() => onFlash("Case audit trail opened")}>
            •••
          </button>
        </header>
        <span className="caseStatus">● {c.status}</span>
        <h3>{c.item}</h3>
        <p>
          {c.issue} · {c.bureau} · Round {c.round}
        </p>
        <div className="caseStrength">
          <span>
            <b>{c.score}%</b>
            <small>EVIDENCE STRENGTH</small>
          </span>
          <em>
            <i style={{ width: `${c.score}%` }} />
          </em>
        </div>
        <div className="caseFacts">
          {[
            ["DISPUTED FIELD", c.issue],
            ["REPORTED VALUE", "$4,281 / 120+ days late"],
            ["CONSUMER POSITION", "Balance and status are inaccurate"],
            [
              "REQUESTED RESULT",
              "Investigate and correct or delete if unverifiable",
            ],
          ].map((x) => (
            <span key={x[0]}>
              <small>{x[0]}</small>
              <b>{x[1]}</b>
            </span>
          ))}
        </div>
        <div className="caseTimeline">
          {[
            ["REPORT REVIEWED", "Aug 10", "✓"],
            ["EVIDENCE LOCKED", "Aug 11", "✓"],
            ["DISPUTE MAILED", "Aug 12", "✓"],
            ["RESPONSE DUE", c.due, ""],
          ].map((x) => (
            <article className={x[2] ? "done" : ""} key={x[0]}>
              <i>{x[2]}</i>
              <span>
                <b>{x[0]}</b>
                <small>{x[1]}</small>
              </span>
            </article>
          ))}
        </div>
        <button onClick={() => onFlash("Response analyzer opened")}>
          Analyze bureau response
        </button>
        <button onClick={() => onFlash("Escalation path prepared")}>
          Prepare next lawful action
        </button>
      </aside>
    </div>
  );
}

function DisputeClients({
  onCase,
  onFlash,
}: {
  onCase: () => void;
  onFlash: (m: string) => void;
}) {
  return (
    <div className="disputeClients">
      <div className="disputeHero compact">
        <div>
          <span>CLIENT OPERATIONS</span>
          <h1>One consumer. One defensible record.</h1>
          <p>
            Reports, identity documents, consent, contracts, disputes, results,
            communications, and billing.
          </p>
        </div>
        <button onClick={() => onFlash("Secure client invitation created")}>
          ＋ Invite client
        </button>
      </div>
      <section className="disputePanel clientPortfolio">
        <header>
          <span>CLIENT</span>
          <span>ACTIVE ITEMS</span>
          <span>NEXT ACTION</span>
          <span>OUTCOME</span>
          <span>RISK</span>
        </header>
        {[
          [
            "AC",
            "Amelia Carter",
            "7",
            "Experian response · 12d",
            "4 corrected",
            "LOW",
          ],
          [
            "MR",
            "Marcus Reed",
            "11",
            "Furnisher response · 3d",
            "6 corrected",
            "URGENT",
          ],
          [
            "SB",
            "Sofia Bennett",
            "5",
            "Equifax investigation · 10d",
            "2 corrected",
            "LOW",
          ],
          [
            "DF",
            "Daniel Foster",
            "9",
            "CFPB eligibility review",
            "5 corrected",
            "REVIEW",
          ],
        ].map((x) => (
          <button onClick={onCase} key={x[1]}>
            <span>
              <i>{x[0]}</i>
              <b>{x[1]}</b>
            </span>
            <strong>{x[2]}</strong>
            <span>{x[3]}</span>
            <em>{x[4]}</em>
            <small>{x[5]}</small>
          </button>
        ))}
      </section>
    </div>
  );
}

function DisputeTemplates({
  template,
  setTemplate,
  generated,
  setGenerated,
  onFlash,
}: {
  template: string;
  setTemplate: (v: string) => void;
  generated: boolean;
  setGenerated: (v: boolean) => void;
  onFlash: (m: string) => void;
}) {
  const templates = [
    "CRA factual dispute — inaccurate account data",
    "Direct furnisher dispute — Regulation V",
    "Method of verification request",
    "Identity theft block request — verified victims only",
    "Debt collector validation request",
    "Obsolete information dispute",
    "Mixed-file / identity mismatch",
    "CFPB complaint narrative — after dispute eligibility",
  ];
  return (
    <div className="templateWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>COMPLIANCE-AWARE DOCUMENT ENGINE</span>
          <h1>Specific facts. Relevant law. Complete evidence.</h1>
          <p>
            Templates assemble from the client’s actual report data and
            attachments—never generic blanket language.
          </p>
        </div>
        <button
          onClick={() => {
            setGenerated(true);
            onFlash("Fact-specific draft generated");
          }}
        >
          ✦ Generate draft
        </button>
      </div>
      <div className="templateBuilder">
        <section className="disputePanel templateCatalog">
          <small>TEMPLATE LIBRARY</small>
          {templates.map((t) => (
            <button
              className={template === t ? "active" : ""}
              onClick={() => {
                setTemplate(t);
                setGenerated(false);
              }}
              key={t}
            >
              <span>§</span>
              <div>
                <b>{t}</b>
                <small>Attorney-review ready · version controlled</small>
              </div>
            </button>
          ))}
        </section>
        <section className="disputePanel letterComposer">
          <header>
            <div>
              <small>SELECTED WORKFLOW</small>
              <h2>{template}</h2>
            </div>
            <span>Compliance check: PASSED</span>
          </header>
          <div className="composerChecks">
            <span>✓ Specific disputed field</span>
            <span>✓ Supporting document linked</span>
            <span>✓ Requested correction</span>
            <span>✓ Truth attestation</span>
          </div>
          {generated ? (
            <article className="generatedLetter">
              <small>DRAFT · CONSUMER REVIEW REQUIRED</small>
              <p>
                <b>
                  Re: Request for investigation of specifically identified
                  inaccurate information
                </b>
              </p>
              <p>
                I am writing to dispute the accuracy and completeness of the
                account information identified in the attached report excerpt.
                The specific field disputed is the reported balance/status. My
                records supporting this position are attached and indexed.
              </p>
              <p>
                Please conduct a reasonable reinvestigation, forward all
                relevant information to the furnisher, and correct or delete
                information that is inaccurate, incomplete, or cannot be
                verified. Please provide the written results and an updated
                report.
              </p>
              <p>
                <b>Authority map:</b> FCRA §§ 611 and 623; Regulation V §
                1022.43 where applicable.
              </p>
            </article>
          ) : (
            <div className="composerEmpty">
              <span>§</span>
              <h3>Build a defensible dispute</h3>
              <p>
                Select verified facts and evidence, then generate a
                consumer-review draft.
              </p>
            </div>
          )}
          <footer>
            <button onClick={() => onFlash("Attorney review queue opened")}>
              Send for legal review
            </button>
            <button onClick={() => onFlash("Truth attestation requested")}>
              Request consumer approval →
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

const lawCards = [
  [
    "FCRA § 611",
    "15 U.S.C. § 1681i",
    "CRA reinvestigation, relevant information, results, frivolous-dispute notices",
    "CRA dispute · method of verification",
  ],
  [
    "FCRA § 623",
    "15 U.S.C. § 1681s-2",
    "Furnisher accuracy duties and investigations after CRA notice",
    "Furnisher / CRA workflow",
  ],
  [
    "Identity Theft Block",
    "15 U.S.C. § 1681c-2",
    "Block information resulting from documented identity theft",
    "Verified identity-theft cases only",
  ],
  [
    "Obsolescence",
    "15 U.S.C. § 1681c",
    "Time limits for certain adverse information",
    "Obsolete-item review",
  ],
  [
    "Permissible Purpose",
    "15 U.S.C. § 1681b",
    "When a consumer report may be obtained or used",
    "Inquiry / access review",
  ],
  [
    "Disclosures",
    "15 U.S.C. § 1681g",
    "Consumer file disclosure requirements",
    "File disclosure requests",
  ],
  [
    "Regulation V",
    "12 C.F.R. § 1022.43",
    "Direct disputes to furnishers and required contents",
    "Direct furnisher disputes",
  ],
  [
    "CROA",
    "15 U.S.C. §§ 1679–1679j",
    "Advertising, disclosures, contracts, advance fees, cancellation rights",
    "Company compliance",
  ],
  [
    "FDCPA Disputes",
    "15 U.S.C. § 1692g",
    "Debt validation and dispute-related collection duties",
    "Collector correspondence",
  ],
];
function DisputeLawLibrary() {
  return (
    <div className="lawWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>FEDERAL AUTHORITY MAP</span>
          <h1>Law connected to workflow—not pasted blindly.</h1>
          <p>
            Current federal authorities organized by issue, recipient, evidence
            requirements, and procedural timing.
          </p>
        </div>
        <a
          href="https://www.consumerfinance.gov/rules-policy/regulations/1022/43/"
          target="_blank"
          rel="noreferrer"
        >
          Official Regulation V ↗
        </a>
      </div>
      <div className="lawGrid">
        {lawCards.map((x) => (
          <article className="disputePanel" key={x[0]}>
            <header>
              <span>§</span>
              <div>
                <small>{x[1]}</small>
                <h2>{x[0]}</h2>
              </div>
            </header>
            <p>{x[2]}</p>
            <footer>
              <span>{x[3]}</span>
              <button>Open authority →</button>
            </footer>
          </article>
        ))}
      </div>
      <div className="legalNotice">
        Legal reference library—not legal advice. Federal law is only part of
        compliance; state credit-services laws, licensing, bonding,
        telemarketing, privacy, and contract rules require counsel review.
      </div>
    </div>
  );
}

function DisputeMail({ onFlash }: { onFlash: (m: string) => void }) {
  return (
    <div className="mailWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>CERTIFIED MAIL + RESPONSE CONTROL</span>
          <h1>Proof from draft to delivery.</h1>
          <p>
            Document versions, consumer approvals, certified tracking, delivery
            dates, statutory clocks, and returned responses.
          </p>
        </div>
        <button onClick={() => onFlash("Mail batch prepared")}>
          ＋ Prepare mail batch
        </button>
      </div>
      <div className="mailMetrics">
        {[
          ["READY TO MAIL", "18", "$142 postage"],
          ["IN TRANSIT", "34", "100% tracked"],
          ["DELIVERED", "27", "Clocks running"],
          ["RESPONSES DUE", "5", "Next 7 days"],
        ].map((x) => (
          <article className="disputePanel" key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </div>
      <section className="disputePanel mailTable">
        <header>
          <span>CLIENT / RECIPIENT</span>
          <span>DOCUMENT</span>
          <span>TRACKING</span>
          <span>DELIVERED</span>
          <span>DEADLINE</span>
        </header>
        {[
          [
            "Marcus Reed · TransUnion",
            "Round 2 factual dispute",
            "9407 1118 9876 5432",
            "Aug 01",
            "Aug 31",
          ],
          [
            "Amelia Carter · Experian",
            "Round 1 factual dispute",
            "9407 1118 9876 5458",
            "Aug 12",
            "Sep 11",
          ],
          [
            "Sofia Bennett · Equifax",
            "Round 1 factual dispute",
            "9407 1118 9876 5501",
            "In transit",
            "Pending",
          ],
        ].map((x) => (
          <button
            onClick={() => onFlash("Certified-mail evidence opened")}
            key={x[0]}
          >
            {x.map((v) => (
              <span key={v}>{v}</span>
            ))}
          </button>
        ))}
      </section>
    </div>
  );
}

function DisputeAnalytics() {
  return (
    <div className="disputeAnalytics">
      <div className="disputeHero compact">
        <div>
          <span>VERIFIED OUTCOME INTELLIGENCE</span>
          <h1>Measure accuracy outcomes—not empty promises.</h1>
          <p>
            Correction rates, response quality, cycle time, evidence strength,
            bureau behavior, and compliance performance.
          </p>
        </div>
      </div>
      <div className="disputeMetrics">
        {[
          ["VERIFIED CORRECTION RATE", "68%", "Across completed items"],
          ["AVG RESOLUTION TIME", "41d", "−6 days QoQ"],
          ["RESPONSE ANALYZED", "94%", "Within 24 hours"],
          ["CLIENT RETENTION", "91%", "No score guarantees"],
        ].map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </div>
      <div className="analyticsDisputeGrid">
        <section className="disputePanel outcomeBars">
          <small>OUTCOMES BY ISSUE TYPE</small>
          <h2>Verified report changes</h2>
          {[
            ["Identity mismatch", "84%"],
            ["Balance/status error", "72%"],
            ["Duplicate account", "69%"],
            ["Obsolete information", "65%"],
            ["Late payment accuracy", "41%"],
          ].map((x) => (
            <article key={x[0]}>
              <span>{x[0]}</span>
              <em>
                <i style={{ width: x[1] }} />
              </em>
              <b>{x[1]}</b>
            </article>
          ))}
        </section>
        <section className="disputePanel bureauScore">
          <small>BUREAU RESPONSE QUALITY</small>
          <h2>Investigation intelligence</h2>
          {[
            ["Experian", "4.1 / 5", "29d"],
            ["Equifax", "3.8 / 5", "31d"],
            ["TransUnion", "4.0 / 5", "28d"],
            ["Furnishers", "3.4 / 5", "27d"],
          ].map((x) => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <span>{x[1]} completeness</span>
              <em>{x[2]}</em>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

function DisputeCompliance({ onFlash }: { onFlash: (m: string) => void }) {
  return (
    <div className="complianceWorkspace">
      <div className="disputeHero compact">
        <div>
          <span>COMPLIANCE OPERATING SYSTEM</span>
          <h1>Designed to stop bad credit-repair behavior.</h1>
          <p>
            Federal controls plus configurable state-law review, disclosures,
            contracts, consent, billing gates, and audit evidence.
          </p>
        </div>
        <button onClick={() => onFlash("Compliance report generated")}>
          Export compliance report
        </button>
      </div>
      <div className="complianceGrid">
        {[
          [
            "CROA Contract Controls",
            "Written agreement, service description, cost, timing, guarantees, cancellation documents",
            "PASS",
          ],
          [
            "Billing Gate",
            "No charge before the contracted service is fully performed",
            "ENFORCED",
          ],
          [
            "Consumer Rights Disclosure",
            "Required federal disclosure versioned before contract signature",
            "CURRENT",
          ],
          [
            "Three-Day Cancellation",
            "Cancellation window and notice tracked automatically",
            "ENFORCED",
          ],
          [
            "Truth + Accuracy Attestation",
            "Consumer confirms each factual allegation and attachment",
            "REQUIRED",
          ],
          [
            "Identity-Theft Safeguard",
            "No § 605B workflow without identity-theft report and verified evidence",
            "LOCKED",
          ],
          [
            "State Rules Review",
            "State licensing, bonding, fee, contract, and telemarketing matrix",
            "COUNSEL REVIEW",
          ],
          [
            "Template Governance",
            "Authority version, editor, approvals, and use history preserved",
            "AUDITED",
          ],
        ].map((x) => (
          <article className="disputePanel" key={x[0]}>
            <header>
              <span>◇</span>
              <em>{x[2]}</em>
            </header>
            <h2>{x[0]}</h2>
            <p>{x[1]}</p>
            <button onClick={() => onFlash(`${x[0]} control opened`)}>
              Review control →
            </button>
          </article>
        ))}
      </div>
      <div className="complianceWarning">
        <b>Important:</b> Cyncro Dispute does not remove accurate, current
        negative information; does not guarantee score increases or deletions;
        and blocks false identity-theft or blanket dispute workflows.
      </div>
    </div>
  );
}

const suiteData: Record<
  string,
  {
    eyebrow: string;
    title: string;
    description: string;
    action: string;
    metrics: string[][];
    sections: { title: string; subtitle: string; rows: string[][] }[];
  }
> = {
  Leads: {
    eyebrow: "LEAD-TO-CLIENT PIPELINE",
    title: "Turn interest into compliant client relationships.",
    description:
      "Lead capture, consultation audits, nurture, agreement, onboarding, assignment, and attribution.",
    action: "＋ Add lead",
    metrics: [
      ["NEW LEADS", "48", "+22%"],
      ["CONSULTATIONS", "31", "64% booked"],
      ["AGREEMENTS SIGNED", "18", "58% close"],
      ["PIPELINE VALUE", "$27.4K", "This month"],
    ],
    sections: [
      {
        title: "Conversion pipeline",
        subtitle: "Every lead and next action",
        rows: [
          ["Jordan Mills", "Credit audit requested", "CONSULTATION", "$1,497"],
          ["Taylor Brooks", "Agreement opened", "PROPOSAL", "$997"],
          ["Nina Alvarez", "Onboarding incomplete", "SIGNED", "$1,297"],
          ["Owen Hart", "New website lead", "NEW", "$797"],
        ],
      },
      {
        title: "Automated nurture",
        subtitle: "Email + SMS sequences",
        rows: [
          ["Credit audit follow-up", "842 enrolled", "38% reply", "LIVE"],
          ["No-show recovery", "62 enrolled", "21% rebook", "LIVE"],
          ["Agreement reminder", "34 enrolled", "59% signed", "LIVE"],
        ],
      },
    ],
  },
  "Report Audit": {
    eyebrow: "CREDIT REPORT INTELLIGENCE",
    title: "Import once. Understand every bureau difference.",
    description:
      "Three-bureau import, account matching, issue tagging, one-click audit, reimport comparison, score history, and permanent report snapshots.",
    action: "Import credit report",
    metrics: [
      ["REPORTS IMPORTED", "184", "100% encrypted"],
      ["POTENTIAL ISSUES", "1,428", "Fact review required"],
      ["REIMPORT CHANGES", "312", "This month"],
      ["AVG AUDIT TIME", "2m 14s", "−81%"],
    ],
    sections: [
      {
        title: "Tri-bureau audit",
        subtitle: "Account-level comparison",
        rows: [
          ["Capital One 4412", "EX: $4,281", "EQ: $3,994", "TU: $4,281"],
          ["Midland Credit", "EX: Open", "EQ: Missing", "TU: Collection"],
          ["Chase 1098", "EX: 30 late", "EQ: Current", "TU: 60 late"],
        ],
      },
      {
        title: "Reimport change detector",
        subtitle: "Preserved historical snapshots",
        rows: [
          ["Deleted", "28 items", "Verified across report", "PDF saved"],
          ["Updated positive", "41 items", "Status improved", "PDF saved"],
          ["Updated negative", "9 items", "Review required", "Flagged"],
          ["New accounts", "14 items", "Consumer review", "Pending"],
        ],
      },
    ],
  },
  Inbox: {
    eyebrow: "UNIFIED CLIENT COMMUNICATION",
    title: "Every conversation attached to the case.",
    description:
      "Secure portal messages, email, SMS, web chat, assignments, internal notes, templates, and response-time controls.",
    action: "New message",
    metrics: [
      ["OPEN CONVERSATIONS", "32", "8 assigned to you"],
      ["AVG RESPONSE", "6m 18s", "−42%"],
      ["CLIENT SATISFACTION", "96%", "Last 30 days"],
      ["UNREAD", "7", "2 urgent"],
    ],
    sections: [
      {
        title: "Unified inbox",
        subtitle: "SMS · email · portal · chat",
        rows: [
          ["Marcus Reed", "Uploaded TransUnion response", "PORTAL", "2m"],
          ["Amelia Carter", "Question about investigation", "SMS", "8m"],
          ["Sofia Bennett", "New Equifax alert", "EMAIL", "22m"],
        ],
      },
      {
        title: "Communication automations",
        subtitle: "Context-aware and consent controlled",
        rows: [
          ["Welcome + onboarding", "New client", "Email + SMS", "ACTIVE"],
          ["Report ready", "Import complete", "Push + email", "ACTIVE"],
          [
            "Response deadline",
            "7 days remaining",
            "Internal + client",
            "ACTIVE",
          ],
        ],
      },
    ],
  },
  Tasks: {
    eyebrow: "TEAM WORKFLOW CONTROL",
    title: "Nothing falls through the cracks.",
    description:
      "Tasks, events, queues, recurring work, service-level timers, assignments, calendars, and automated handoffs.",
    action: "＋ Create task",
    metrics: [
      ["DUE TODAY", "29", "5 urgent"],
      ["COMPLETED", "94%", "This week"],
      ["OVERDUE", "0", "SLA protected"],
      ["AUTOMATED", "68%", "No manual touch"],
    ],
    sections: [
      {
        title: "Priority work queue",
        subtitle: "Sorted by deadline and risk",
        rows: [
          ["Analyze TU response", "Marcus Reed", "TODAY 3 PM", "URGENT"],
          [
            "Review identity documents",
            "Sofia Bennett",
            "TODAY 5 PM",
            "NORMAL",
          ],
          ["Prepare Round 2 facts", "Daniel Foster", "TOMORROW", "WATCH"],
        ],
      },
      {
        title: "Calendar + events",
        subtitle: "Consultations and follow-ups",
        rows: [
          ["Client review call", "Amelia Carter", "Aug 14 · 10 AM", "Yvette"],
          ["Affiliate onboarding", "Palm Funding", "Aug 14 · 1 PM", "Dana"],
          ["Team compliance review", "All staff", "Aug 15 · 9 AM", "Owner"],
        ],
      },
    ],
  },
  Billing: {
    eyebrow: "COMPLIANT REVENUE OPERATIONS",
    title: "Bill accurately. Recover revenue. Keep proof.",
    description:
      "Invoices, subscriptions, completed-service billing gates, payment links, dunning, refunds, disputes, tax, and accounting reconciliation.",
    action: "＋ Create invoice",
    metrics: [
      ["MRR", "$86,420", "+14.8%"],
      ["COLLECTED", "$79,118", "91.5%"],
      ["PAST DUE", "$4,208", "Saver active"],
      ["CHURN", "2.1%", "−0.8%"],
    ],
    sections: [
      {
        title: "Invoices + subscriptions",
        subtitle: "CROA service-completion gates",
        rows: [
          ["Amelia Carter", "Monthly service completed", "$149", "PAID"],
          ["Marcus Reed", "Round 2 service completed", "$199", "DUE"],
          ["Sofia Bennett", "Onboarding service", "$99", "HELD · CANCELLATION"],
        ],
      },
      {
        title: "Subscription Saver",
        subtitle: "Consent-based payment recovery",
        rows: [
          ["Day 1 reminder", "18 accounts", "Email", "ACTIVE"],
          ["Day 3 card update", "9 accounts", "Portal + SMS", "ACTIVE"],
          ["Day 7 team task", "4 accounts", "Manual review", "ACTIVE"],
        ],
      },
    ],
  },
  Affiliates: {
    eyebrow: "REFERRAL PARTNER OPERATIONS",
    title: "Turn trusted partners into predictable growth.",
    description:
      "Affiliate portal, branded links, attribution, onboarding, lead status, commissions, documents, messaging, and performance analytics.",
    action: "＋ Invite affiliate",
    metrics: [
      ["ACTIVE PARTNERS", "86", "+9 this month"],
      ["REFERRED LEADS", "214", "Last 30 days"],
      ["CLIENTS WON", "74", "34.6%"],
      ["ATTRIBUTED MRR", "$22.8K", "26% total"],
    ],
    sections: [
      {
        title: "Partner leaderboard",
        subtitle: "Quality and revenue attribution",
        rows: [
          ["Palm Funding Group", "42 leads", "18 clients", "$7.8K MRR"],
          ["HomeKey Mortgage", "31 leads", "12 clients", "$4.9K MRR"],
          ["DriveRight Auto", "28 leads", "9 clients", "$3.2K MRR"],
        ],
      },
      {
        title: "Affiliate onboarding",
        subtitle: "Automated education and compliance",
        rows: [
          ["Welcome sequence", "86 enrolled", "100% delivered", "ACTIVE"],
          ["Referral rules attestation", "84 signed", "2 pending", "REQUIRED"],
          ["Monthly partner update", "Aug 15", "86 recipients", "SCHEDULED"],
        ],
      },
    ],
  },
  "Client Portal": {
    eyebrow: "SECURE CLIENT ACCESS",
    title: "Give clients visibility without losing control.",
    description:
      "Mobile-first onboarding, agreements, documents, scores, dispute choices, progress, messages, invoices, notifications, education, and referrals.",
    action: "Preview mobile portal",
    metrics: [
      ["PORTAL ADOPTION", "92%", "169 active"],
      ["ONBOARDING COMPLETE", "88%", "+11%"],
      ["PUSH ENABLED", "81%", "137 clients"],
      ["SELF-SERVICE", "64%", "Fewer status calls"],
    ],
    sections: [
      {
        title: "Onboarding journey",
        subtitle: "English + Spanish",
        rows: [
          [
            "Identity verification",
            "Government ID + proof of address",
            "184/184",
            "REQUIRED",
          ],
          [
            "Consumer rights disclosure",
            "Viewed + acknowledged",
            "181/184",
            "3 PENDING",
          ],
          [
            "Digital agreement",
            "Signed + cancellation notice",
            "178/184",
            "6 PENDING",
          ],
          [
            "Report connection",
            "Monitoring or upload",
            "171/184",
            "13 PENDING",
          ],
        ],
      },
      {
        title: "Client Choice",
        subtitle: "Consumer controls disputed items",
        rows: [
          ["Items selected", "428", "Truth attested", "READY"],
          ["Items awaiting review", "72", "Needs reason", "PENDING"],
          ["Items declined", "39", "Accurate/current", "PROTECTED"],
        ],
      },
    ],
  },
  Team: {
    eyebrow: "PEOPLE + PERMISSIONS",
    title: "Scale the company without exposing client data.",
    description:
      "Role-based access, workload, teams, specialist assignment, approval limits, audit history, training, and performance.",
    action: "＋ Invite teammate",
    metrics: [
      ["TEAM MEMBERS", "18", "4 roles"],
      ["ACTIVE CASELOAD", "18.2", "Per specialist"],
      ["SLA SCORE", "97%", "Top quartile"],
      ["TRAINING CURRENT", "100%", "Quarterly"],
    ],
    sections: [
      {
        title: "Team workload",
        subtitle: "Balanced by capacity and skill",
        rows: [
          ["Yvette Lomeli", "Owner", "Full access", "86 cases"],
          ["Dana Pierce", "Compliance manager", "Approval + audit", "42 cases"],
          ["Maya Torres", "Dispute specialist", "Assigned clients", "38 cases"],
          ["Andre Cole", "Client success", "Portal + messaging", "52 clients"],
        ],
      },
      {
        title: "Permission policies",
        subtitle: "Least-privilege access",
        rows: [
          ["Owner", "All modules + billing", "2 users", "ACTIVE"],
          ["Compliance", "Templates + approvals + audit", "3 users", "ACTIVE"],
          ["Specialist", "Assigned clients only", "9 users", "ACTIVE"],
          ["Affiliate", "Referred lead status only", "86 users", "ISOLATED"],
        ],
      },
    ],
  },
  Marketing: {
    eyebrow: "GROWTH AUTOMATION HUB",
    title: "Attract, nurture, convert, review, and refer.",
    description:
      "Landing pages, forms, email/SMS, web chat, social inbox, reputation, referral campaigns, segmentation, attribution, and scheduling.",
    action: "＋ Create campaign",
    metrics: [
      ["LEADS GENERATED", "486", "This month"],
      ["NURTURE CONVERSION", "18.4%", "+4.2%"],
      ["REVIEWS", "4.9★", "312 total"],
      ["CAMPAIGN ROI", "8.7×", "Attributed"],
    ],
    sections: [
      {
        title: "Campaign command",
        subtitle: "Omnichannel journeys",
        rows: [
          ["Credit audit funnel", "Meta + landing page", "184 leads", "LIVE"],
          ["Cold lead reactivation", "SMS + email", "42 appointments", "LIVE"],
          ["Client milestone reviews", "Email + portal", "31 reviews", "LIVE"],
          [
            "Affiliate recruitment",
            "Social + webinar",
            "18 partners",
            "SCHEDULED",
          ],
        ],
      },
      {
        title: "Unified social + chat",
        subtitle: "Instagram · Facebook · SMS · web",
        rows: [
          ["CREDIT keyword", "128 conversations", "42 booked", "ACTIVE"],
          ["Website chat", "94 conversations", "31 qualified", "ACTIVE"],
          ["Facebook comments", "62 triggers", "18 leads", "ACTIVE"],
        ],
      },
    ],
  },
};

function DisputeSuiteView({
  name,
  onFlash,
}: {
  name: keyof typeof suiteData;
  onFlash: (m: string) => void;
}) {
  const data = suiteData[name];
  return (
    <div className="disputeSuiteView">
      <div className="disputeHero compact">
        <div>
          <span>{data.eyebrow}</span>
          <h1>{data.title}</h1>
          <p>{data.description}</p>
        </div>
        <button onClick={() => onFlash(`${data.action} opened`)}>
          {data.action}
        </button>
      </div>
      <div className="disputeMetrics">
        {data.metrics.map((m) => (
          <article key={m[0]}>
            <small>{m[0]}</small>
            <b>{m[1]}</b>
            <span>{m[2]}</span>
          </article>
        ))}
      </div>
      <div className="suiteSections">
        {data.sections.map((section) => (
          <section className="disputePanel suiteTable" key={section.title}>
            <header>
              <div>
                <small>{section.subtitle.toUpperCase()}</small>
                <h2>{section.title}</h2>
              </div>
              <button
                onClick={() => onFlash(`${section.title} controls opened`)}
              >
                Manage →
              </button>
            </header>
            {section.rows.map((row, i) => (
              <button
                onClick={() => onFlash(`${row[0]} record opened`)}
                key={`${row[0]}-${i}`}
              >
                {row.map((cell, j) => (
                  <span
                    className={j === 0 ? "primary" : ""}
                    key={`${cell}-${j}`}
                  >
                    {cell}
                  </span>
                ))}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
function DisputeLeads({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Leads" onFlash={onFlash} />;
}
function DisputeReportAudit({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Report Audit" onFlash={onFlash} />;
}
function DisputeInbox({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Inbox" onFlash={onFlash} />;
}
function DisputeTasks({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Tasks" onFlash={onFlash} />;
}
function DisputeBilling({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Billing" onFlash={onFlash} />;
}
function DisputeAffiliates({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Affiliates" onFlash={onFlash} />;
}
function DisputeClientPortal({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Client Portal" onFlash={onFlash} />;
}
function DisputeTeam({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Team" onFlash={onFlash} />;
}
function DisputeMarketing({ onFlash }: { onFlash: (m: string) => void }) {
  return <DisputeSuiteView name="Marketing" onFlash={onFlash} />;
}

type FinanceView =
  | "Command"
  | "Deal Queue"
  | "Deal Architect"
  | "Lenders"
  | "Product Menu"
  | "Contracts"
  | "Funding"
  | "Tax & Lease Lab"
  | "Compliance"
  | "Customers"
  | "Analytics";

const financeDeals = [
  {
    customer: "Olivia Bennett",
    vehicle: "2026 Porsche Macan S",
    stock: "P24018",
    score: "742",
    payment: "$1,146",
    gross: "$6,840",
    status: "READY TO PRESENT",
    lender: "Chase Auto",
    risk: "LOW",
  },
  {
    customer: "Noah Williams",
    vehicle: "2025 BMW X5 xDrive40i",
    stock: "B51882",
    score: "681",
    payment: "$984",
    gross: "$5,420",
    status: "LENDER REVIEW",
    lender: "BMW Financial",
    risk: "MEDIUM",
  },
  {
    customer: "Sophia Carter",
    vehicle: "2026 Mercedes GLC 300",
    stock: "M60117",
    score: "718",
    payment: "$862",
    gross: "$7,190",
    status: "STIPS NEEDED",
    lender: "Mercedes-Benz FS",
    risk: "MEDIUM",
  },
  {
    customer: "Liam Rodriguez",
    vehicle: "2025 Audi Q7 Premium Plus",
    stock: "A74221",
    score: "655",
    payment: "$1,032",
    gross: "$4,980",
    status: "CONTRACTING",
    lender: "Ally",
    risk: "WATCH",
  },
];

function CyncroFinance() {
  const [view, setView] = useState<FinanceView>("Command");
  const [deal, setDeal] = useState(0);
  const [notice, setNotice] = useState("");
  const [aiOpen, setAiOpen] = useState(true);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const nav: { name: FinanceView; icon: string }[] = [
    { name: "Command", icon: "⌂" },
    { name: "Deal Queue", icon: "▦" },
    { name: "Deal Architect", icon: "✦" },
    { name: "Lenders", icon: "◎" },
    { name: "Product Menu", icon: "◇" },
    { name: "Contracts", icon: "▤" },
    { name: "Funding", icon: "$" },
    { name: "Tax & Lease Lab", icon: "%" },
    { name: "Compliance", icon: "◈" },
    { name: "Customers", icon: "♙" },
    { name: "Analytics", icon: "⌁" },
  ];
  return (
    <section className="financeShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      <aside className="financeSidebar">
        <div className="financeBrand">
          <span>CF</span>
          <div>
            <b>Cyncro Finance</b>
            <small>AUTOMOTIVE F&amp;I INTELLIGENCE</small>
          </div>
        </div>
        <button
          className="rooftopPicker"
          onClick={() => flash("Rooftop switcher opened")}
        >
          <span>VP</span>
          <div>
            <small>ACTIVE ROOFTOP</small>
            <b>Vivid Premier Auto</b>
          </div>
          <i>⌄</i>
        </button>
        <nav>
          {nav.map((item) => (
            <button
              key={item.name}
              className={view === item.name ? "active" : ""}
              onClick={() => setView(item.name)}
            >
              <i>{item.icon}</i>
              <span>{item.name}</span>
              {item.name === "Deal Queue" && <em>18</em>}
            </button>
          ))}
        </nav>
        <div className="financePulse">
          <span>FUNDING PULSE</span>
          <b>$428,600</b>
          <small>14 contracts pending · 2 aging alerts</small>
          <div>
            <i style={{ width: "78%" }} />
          </div>
        </div>
      </aside>
      <main className="financeMain">
        <header className="financeTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Command" ? "Finance Command" : view}</b>
          </div>
          <div>
            <button
              onClick={() =>
                flash("Global vehicle, customer and deal search opened")
              }
            >
              ⌕ Search
            </button>
            <button onClick={() => setAiOpen(!aiOpen)}>✦ Cyncro AI</button>
            <button
              onClick={() => {
                setView("Deal Architect");
                flash("New deal jacket created");
              }}
            >
              ＋ New deal
            </button>
          </div>
        </header>
        <div className="financeContent">
          {view === "Command" && (
            <FinanceCommand
              onView={setView}
              onFlash={flash}
              onDeal={(i) => {
                setDeal(i);
                setView("Deal Architect");
              }}
            />
          )}
          {view === "Deal Queue" && (
            <FinanceDealQueue
              onOpen={(i) => {
                setDeal(i);
                setView("Deal Architect");
              }}
              onFlash={flash}
            />
          )}
          {view === "Deal Architect" && (
            <FinanceArchitect deal={financeDeals[deal]} onFlash={flash} />
          )}
          {view === "Tax & Lease Lab" && <TaxLeaseLab onFlash={flash} />}
          {view !== "Command" &&
            view !== "Deal Queue" &&
            view !== "Deal Architect" &&
            view !== "Tax & Lease Lab" && (
              <FinanceWorkspace view={view} onFlash={flash} />
            )}
        </div>
      </main>
      {aiOpen && <FinanceAI onClose={() => setAiOpen(false)} onFlash={flash} />}
    </section>
  );
}

function FinanceCommand({
  onView,
  onFlash,
  onDeal,
}: {
  onView: (v: FinanceView) => void;
  onFlash: (m: string) => void;
  onDeal: (i: number) => void;
}) {
  return (
    <>
      <section className="financeHero">
        <div>
          <span>LIVE F&amp;I OPERATING SYSTEM</span>
          <h1>
            Move every deal.
            <br />
            <i>Protect every dollar.</i>
          </h1>
          <p>
            One intelligent command layer for desking, lender strategy, product
            presentation, compliance, contracting, funding and customer
            delivery.
          </p>
        </div>
        <div className="financeHeroActions">
          <button onClick={() => onView("Deal Architect")}>
            ✦ Architect a deal
          </button>
          <button onClick={() => onView("Deal Queue")}>
            Open live queue →
          </button>
        </div>
      </section>
      <section className="financeKpis">
        {[
          ["TODAY'S FRONT GROSS", "$48,920", "+12.8% vs pace"],
          ["BACK GROSS / DEAL", "$2,418", "+$284 MTD"],
          ["PRODUCT PENETRATION", "68.4%", "VSC · GAP · Tire"],
          ["AVG FUNDING TIME", "1.7 days", "−0.6 days"],
        ].map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </section>
      <div className="financeCommandGrid">
        <section className="financePanel liveDeals">
          <header>
            <div>
              <small>REAL-TIME DEAL FLOW</small>
              <h2>Deals requiring attention</h2>
            </div>
            <button onClick={() => onView("Deal Queue")}>View all 18 →</button>
          </header>
          {financeDeals.map((d, i) => (
            <button key={d.stock} onClick={() => onDeal(i)}>
              <span className={`riskDot ${d.risk.toLowerCase()}`} />
              <div>
                <b>{d.customer}</b>
                <small>
                  {d.vehicle} · {d.stock}
                </small>
              </div>
              <div>
                <small>PAYMENT</small>
                <b>{d.payment}</b>
              </div>
              <div>
                <small>BACK GROSS</small>
                <b>{d.gross}</b>
              </div>
              <em>{d.status}</em>
              <i>→</i>
            </button>
          ))}
        </section>
        <section className="financePanel aiBrief">
          <header>
            <div>
              <small>CYNCRO INTELLIGENCE</small>
              <h2>Morning opportunity brief</h2>
            </div>
            <span>LIVE</span>
          </header>
          <h3>$18,420 in recoverable gross</h3>
          <p>
            Seven open deals have a higher approval probability or product
            opportunity than their current structure reflects.
          </p>
          {[
            ["3 deals", "Improve lender fit", "Est. +$5,800"],
            ["4 menus", "Rebuild product mix", "Est. +$7,260"],
            ["2 contracts", "Resolve funding holds", "Release $92K"],
          ].map((x) => (
            <button
              key={x[0]}
              onClick={() => onFlash(`${x[1]} recommendations opened`)}
            >
              <b>{x[0]}</b>
              <span>{x[1]}</span>
              <em>{x[2]}</em>
            </button>
          ))}
          <button
            className="askFinanceAI"
            onClick={() => onFlash("Cyncro AI deal briefing opened")}
          >
            Ask Cyncro AI about the book →
          </button>
        </section>
        <section className="financePanel fundingBoard">
          <header>
            <div>
              <small>FUNDING CONTROL</small>
              <h2>Contract aging</h2>
            </div>
            <button onClick={() => onView("Funding")}>Funding center →</button>
          </header>
          {[
            ["0–1 DAYS", "9", "$286K", "healthy"],
            ["2–3 DAYS", "3", "$96K", "watch"],
            ["4+ DAYS", "2", "$46K", "danger"],
          ].map((x) => (
            <article key={x[0]}>
              <span className={x[3]}>{x[0]}</span>
              <b>{x[1]} deals</b>
              <strong>{x[2]}</strong>
            </article>
          ))}
        </section>
        <section className="financePanel lenderPulse">
          <header>
            <div>
              <small>LENDER NETWORK</small>
              <h2>Approval performance</h2>
            </div>
            <button onClick={() => onView("Lenders")}>Lender matrix →</button>
          </header>
          {[
            ["Chase Auto", "86%", "1.4d"],
            ["Ally", "82%", "1.8d"],
            ["Capital One Auto", "79%", "1.2d"],
            ["Westlake", "71%", "2.6d"],
          ].map((x, i) => (
            <article key={x[0]}>
              <b>{x[0]}</b>
              <div>
                <i style={{ width: x[1] }} />
              </div>
              <span>{x[1]} approval</span>
              <em>{x[2]}</em>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}

function FinanceDealQueue({
  onOpen,
  onFlash,
}: {
  onOpen: (i: number) => void;
  onFlash: (m: string) => void;
}) {
  const [filter, setFilter] = useState("All deals");
  return (
    <div className="financeWorkspace">
      <div className="financePageHead">
        <div>
          <span>18 ACTIVE DEALS · $126K GROSS AT WORK</span>
          <h1>Deal Queue</h1>
          <p>
            Every handoff, approval, stipulation, signature and funding deadline
            in one live queue.
          </p>
        </div>
        <button onClick={() => onFlash("Deal imported from CRM")}>
          ＋ Import deal
        </button>
      </div>
      <div className="financeFilters">
        {[
          "All deals",
          "Needs attention",
          "Awaiting lender",
          "Contracting",
          "Funding",
        ].map((x) => (
          <button
            className={filter === x ? "active" : ""}
            onClick={() => setFilter(x)}
            key={x}
          >
            {x}
          </button>
        ))}
        <input
          aria-label="Search deals"
          placeholder="Search customer, VIN or stock…"
        />
      </div>
      <section className="financePanel dealTable">
        <header>
          <span>CUSTOMER / VEHICLE</span>
          <span>CREDIT</span>
          <span>STRUCTURE</span>
          <span>LENDER</span>
          <span>STATUS</span>
          <span>GROSS</span>
        </header>
        {[
          ...financeDeals,
          ...financeDeals.slice(0, 2).map((d, i) => ({
            ...d,
            customer: i ? "Ethan Parker" : "Mia Thompson",
            stock: i ? "L51207" : "R88103",
          })),
        ].map((d, i) => (
          <button
            key={`${d.stock}-${i}`}
            onClick={() => onOpen(i % financeDeals.length)}
          >
            <div>
              <b>{d.customer}</b>
              <small>
                {d.vehicle} · {d.stock}
              </small>
            </div>
            <span>
              {d.score}
              <small>{d.risk} RISK</small>
            </span>
            <span>
              {d.payment}
              <small>72 mo · 7.49%</small>
            </span>
            <span>
              {d.lender}
              <small>Top match</small>
            </span>
            <em>{d.status}</em>
            <strong>{d.gross}</strong>
          </button>
        ))}
      </section>
    </div>
  );
}

function FinanceArchitect({
  deal,
  onFlash,
}: {
  deal: (typeof financeDeals)[number];
  onFlash: (m: string) => void;
}) {
  const [term, setTerm] = useState(72);
  const [down, setDown] = useState(7500);
  const [selected, setSelected] = useState([
    "Vehicle Service Contract",
    "GAP Protection",
  ]);
  const payment = Math.round(
    890 + (72 - term) * 8 - down * 0.014 + selected.length * 34,
  );
  return (
    <div className="financeWorkspace">
      <div className="dealIdentity">
        <div>
          <span>ACTIVE DEAL · {deal.stock}</span>
          <h1>{deal.customer}</h1>
          <p>
            {deal.vehicle} · Score {deal.score} · {deal.lender}
          </p>
        </div>
        <div>
          <button onClick={() => onFlash("Customer co-browse link sent")}>
            Invite customer
          </button>
          <button onClick={() => onFlash("Deal saved and compliance checked")}>
            Save deal
          </button>
          <button onClick={() => onFlash("Deal advanced to contracting")}>
            Send to contract →
          </button>
        </div>
      </div>
      <div className="architectGrid">
        <section className="financePanel structurePanel">
          <header>
            <div>
              <small>LIVE DEAL STRUCTURE</small>
              <h2>Build the approval</h2>
            </div>
            <em>AI OPTIMIZED</em>
          </header>
          <div className="vehiclePrice">
            <span>Selling price</span>
            <b>$78,450</b>
            <small>Market position: 97%</small>
          </div>
          <label>
            Cash down <b>${down.toLocaleString()}</b>
            <input
              type="range"
              min="0"
              max="20000"
              step="500"
              value={down}
              onChange={(e) => setDown(Number(e.target.value))}
            />
          </label>
          <div className="termOptions">
            {[60, 72, 84].map((x) => (
              <button
                className={term === x ? "active" : ""}
                onClick={() => setTerm(x)}
                key={x}
              >
                <b>{x}</b>
                <small>months</small>
              </button>
            ))}
          </div>
          <div className="paymentOutput">
            <small>ESTIMATED PAYMENT</small>
            <b>
              ${payment}
              <i>/mo</i>
            </b>
            <span>7.49% APR · ${down.toLocaleString()} down</span>
          </div>
          <div className="dealMath">
            {[
              ["Trade allowance", "$24,600"],
              ["Trade payoff", "−$18,220"],
              ["Taxes + fees", "$5,984"],
              ["Amount financed", "$71,614"],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
        <section className="financePanel lenderMatches">
          <header>
            <div>
              <small>REAL-TIME LENDER FIT</small>
              <h2>Approval paths</h2>
            </div>
            <button onClick={() => onFlash("All lender programs compared")}>
              Compare all
            </button>
          </header>
          {[
            ["Chase Auto", "94%", "7.49%", "$1,425", "BEST FIT"],
            ["Capital One Auto", "89%", "7.79%", "$1,180", "FASTEST"],
            ["Ally", "84%", "8.10%", "$1,695", "MAX ADVANCE"],
          ].map((x, i) => (
            <button
              className={i === 0 ? "selected" : ""}
              key={x[0]}
              onClick={() => onFlash(`${x[0]} program selected`)}
            >
              <span>{i + 1}</span>
              <div>
                <b>{x[0]}</b>
                <small>{x[4]}</small>
              </div>
              <strong>
                {x[1]}
                <small>approval</small>
              </strong>
              <em>
                {x[2]}
                <small>buy rate</small>
              </em>
              <i>
                {x[3]}
                <small>reserve</small>
              </i>
            </button>
          ))}
        </section>
        <section className="financePanel productBuilder">
          <header>
            <div>
              <small>PERSONALIZED MENU</small>
              <h2>Protection products</h2>
            </div>
            <span>{selected.length} SELECTED</span>
          </header>
          {[
            ["Vehicle Service Contract", "$2,895", "82% fit"],
            ["GAP Protection", "$995", "91% fit"],
            ["Tire & Wheel", "$1,295", "76% fit"],
            ["Appearance Protection", "$895", "58% fit"],
          ].map((x) => (
            <button
              className={selected.includes(x[0]) ? "selected" : ""}
              onClick={() =>
                setSelected((s) =>
                  s.includes(x[0]) ? s.filter((y) => y !== x[0]) : [...s, x[0]],
                )
              }
              key={x[0]}
            >
              <i>{selected.includes(x[0]) ? "✓" : "＋"}</i>
              <div>
                <b>{x[0]}</b>
                <small>{x[2]} · customer profile match</small>
              </div>
              <strong>{x[1]}</strong>
            </button>
          ))}
          <button
            className="presentMenu"
            onClick={() => onFlash("Interactive customer menu launched")}
          >
            Present customer menu →
          </button>
        </section>
        <section className="financePanel dealGuard">
          <header>
            <div>
              <small>AUTOMATED DEAL GUARD</small>
              <h2>Compliance + funding readiness</h2>
            </div>
            <em>7/8 CLEAR</em>
          </header>
          {[
            ["OFAC / identity verification", "PASS"],
            ["Credit authorization", "SIGNED"],
            ["Adverse action logic", "CLEAR"],
            ["Income verification", "NEEDED"],
            ["Red Flags review", "PASS"],
            ["Menu disclosure", "TRACKED"],
          ].map((x) => (
            <p key={x[0]}>
              <span>{x[0]}</span>
              <b className={x[1] === "NEEDED" ? "warn" : ""}>{x[1]}</b>
            </p>
          ))}
          <button
            onClick={() => onFlash("Secure income verification request sent")}
          >
            Request missing stipulation →
          </button>
        </section>
      </div>
    </div>
  );
}

const stateTaxRules = [
  ["AL", "Alabama", 4],
  ["AK", "Alaska", 0],
  ["AZ", "Arizona", 5.6],
  ["AR", "Arkansas", 6.5],
  ["CA", "California", 7.25],
  ["CO", "Colorado", 2.9],
  ["CT", "Connecticut", 6.35],
  ["DE", "Delaware", 0],
  ["DC", "District of Columbia", 6],
  ["FL", "Florida", 6],
  ["GA", "Georgia", 7],
  ["HI", "Hawaii", 4],
  ["ID", "Idaho", 6],
  ["IL", "Illinois", 6.25],
  ["IN", "Indiana", 7],
  ["IA", "Iowa", 6],
  ["KS", "Kansas", 6.5],
  ["KY", "Kentucky", 6],
  ["LA", "Louisiana", 5],
  ["ME", "Maine", 5.5],
  ["MD", "Maryland", 6],
  ["MA", "Massachusetts", 6.25],
  ["MI", "Michigan", 6],
  ["MN", "Minnesota", 6.875],
  ["MS", "Mississippi", 5],
  ["MO", "Missouri", 4.225],
  ["MT", "Montana", 0],
  ["NE", "Nebraska", 5.5],
  ["NV", "Nevada", 6.85],
  ["NH", "New Hampshire", 0],
  ["NJ", "New Jersey", 6.625],
  ["NM", "New Mexico", 4.875],
  ["NY", "New York", 4],
  ["NC", "North Carolina", 3],
  ["ND", "North Dakota", 5],
  ["OH", "Ohio", 5.75],
  ["OK", "Oklahoma", 3.25],
  ["OR", "Oregon", 0],
  ["PA", "Pennsylvania", 6],
  ["RI", "Rhode Island", 7],
  ["SC", "South Carolina", 5],
  ["SD", "South Dakota", 4.2],
  ["TN", "Tennessee", 7],
  ["TX", "Texas", 6.25],
  ["UT", "Utah", 6.1],
  ["VT", "Vermont", 6],
  ["VA", "Virginia", 4.15],
  ["WA", "Washington", 6.5],
  ["WV", "West Virginia", 6],
  ["WI", "Wisconsin", 5],
  ["WY", "Wyoming", 4],
] as const;

function TaxLeaseLab({ onFlash }: { onFlash: (m: string) => void }) {
  const [state, setState] = useState("FL");
  const [zip, setZip] = useState("33411");
  const [price, setPrice] = useState(78450);
  const [trade, setTrade] = useState(24600);
  const [payoff, setPayoff] = useState(18220);
  const [rebate, setRebate] = useState(1500);
  const [fees, setFees] = useState(1295);
  const [localRate, setLocalRate] = useState(1);
  const [term, setTerm] = useState(36);
  const [miles, setMiles] = useState(10000);
  const [residual, setResidual] = useState(58);
  const [moneyFactor, setMoneyFactor] = useState(0.00215);
  const [driveOff, setDriveOff] = useState(3500);
  const [taxMode, setTaxMode] = useState<"monthly" | "upfront">("monthly");
  const rule = stateTaxRules.find((x) => x[0] === state) ?? stateTaxRules[9];
  const combinedRate = Number(rule[2]) + localRate;
  const equity = Math.max(0, trade - payoff);
  const taxablePurchase = Math.max(0, price - trade - rebate);
  const purchaseTax = taxablePurchase * (combinedRate / 100);
  const outTheDoor = price - equity - rebate + fees + purchaseTax;
  const residualValue = price * (residual / 100);
  const adjustedCap = Math.max(0, price + fees - rebate - equity - driveOff);
  const depreciation = (adjustedCap - residualValue) / term;
  const rentCharge = (adjustedCap + residualValue) * moneyFactor;
  const baseLease = Math.max(0, depreciation + rentCharge);
  const monthlyTax =
    taxMode === "monthly" ? baseLease * (combinedRate / 100) : 0;
  const upfrontTax =
    taxMode === "upfront" ? baseLease * term * (combinedRate / 100) : 0;
  const leasePayment = baseLease + monthlyTax;
  const totalLease = leasePayment * term + driveOff + upfrontTax;
  const apr = moneyFactor * 2400;
  const mileageAdjustment =
    miles === 7500 ? 2 : miles === 10000 ? 0 : miles === 12000 ? -1 : -3;
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const scenarios = [
    [
      "Lowest payment",
      term + 3,
      residual + 2 + mileageAdjustment,
      Math.max(0.0001, moneyFactor - 0.0002),
      driveOff + 2500,
    ],
    ["Balanced", term, residual + mileageAdjustment, moneyFactor, driveOff],
    [
      "Lowest drive-off",
      term,
      residual + mileageAdjustment,
      moneyFactor + 0.0001,
      995,
    ],
  ] as const;
  return (
    <div className="financeWorkspace taxLeaseLab">
      <div className="financePageHead taxLabHead">
        <div>
          <span>50-STATE + D.C. DEAL INTELLIGENCE</span>
          <h1>Tax &amp; Lease Intelligence Lab</h1>
          <p>
            Model the complete transaction—not just a payment. Compare
            jurisdiction logic, trade treatment, rebates, fees, residual
            exposure and lease structures in one customer-ready workspace.
          </p>
        </div>
        <div>
          <button onClick={() => onFlash("State rule verification requested")}>
            Verify jurisdiction
          </button>
          <button onClick={() => onFlash("Customer comparison link generated")}>
            Share live comparison →
          </button>
        </div>
      </div>
      <div className="taxConfidence">
        <div>
          <span>◈</span>
          <p>
            <b>Jurisdiction confidence layer</b>
            <small>
              {rule[1]} baseline loaded · ZIP {zip || "required"} · Local rate
              manually confirmed at {localRate.toFixed(2)}%
            </small>
          </p>
        </div>
        <em>ESTIMATE · VERIFY BEFORE CONTRACT</em>
      </div>
      <div className="taxLeaseGrid">
        <section className="financePanel calculatorInputs">
          <header>
            <div>
              <small>TRANSACTION INPUTS</small>
              <h2>Vehicle + jurisdiction</h2>
            </div>
            <button onClick={() => onFlash("VIN decoded and fees refreshed")}>
              Decode VIN
            </button>
          </header>
          <div className="calcFields">
            <label>
              State
              <select value={state} onChange={(e) => setState(e.target.value)}>
                {stateTaxRules.map((x) => (
                  <option key={x[0]} value={x[0]}>
                    {x[1]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Registration ZIP
              <input
                value={zip}
                onChange={(e) =>
                  setZip(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
              />
            </label>
            <CalcInput label="Selling price" value={price} set={setPrice} />
            <CalcInput label="Trade allowance" value={trade} set={setTrade} />
            <CalcInput label="Trade payoff" value={payoff} set={setPayoff} />
            <CalcInput
              label="Rebate / incentive"
              value={rebate}
              set={setRebate}
            />
            <CalcInput label="Taxable fees" value={fees} set={setFees} />
            <label>
              Local + district rate
              <input
                type="number"
                step="0.01"
                value={localRate}
                onChange={(e) => setLocalRate(Number(e.target.value))}
              />
              <small>State baseline {Number(rule[2]).toFixed(3)}%</small>
            </label>
          </div>
          <div className="taxRuleStack">
            {[
              ["State baseline", `${Number(rule[2]).toFixed(3)}%`],
              ["Local override", `${localRate.toFixed(3)}%`],
              ["Combined estimate", `${combinedRate.toFixed(3)}%`],
              ["Trade equity", fmt(equity)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
        <section className="financePanel taxOutput">
          <header>
            <div>
              <small>OUT-THE-DOOR ENGINE</small>
              <h2>{rule[1]} purchase estimate</h2>
            </div>
            <em>ZIP-AWARE READY</em>
          </header>
          <div className="taxHeroNumber">
            <small>ESTIMATED OUT-THE-DOOR</small>
            <b>{fmt(outTheDoor)}</b>
            <span>{combinedRate.toFixed(3)}% modeled combined rate</span>
          </div>
          <div className="taxBreakdown">
            {[
              ["Selling price", fmt(price)],
              ["Net trade equity", `−${fmt(equity)}`],
              ["Rebates", `−${fmt(rebate)}`],
              ["Estimated taxable base", fmt(taxablePurchase)],
              ["Government + dealer fees", fmt(fees)],
              ["Estimated tax", fmt(purchaseTax)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
          <button
            onClick={() => onFlash("Line-by-line tax worksheet generated")}
          >
            Generate audit-ready worksheet →
          </button>
        </section>
        <section className="financePanel leaseInputs">
          <header>
            <div>
              <small>LEASE STRUCTURE</small>
              <h2>Build the lease</h2>
            </div>
            <span>MF = {moneyFactor.toFixed(5)}</span>
          </header>
          <div className="leaseControls">
            <label>
              Term
              <div>
                {[24, 36, 39, 48].map((x) => (
                  <button
                    className={term === x ? "active" : ""}
                    onClick={() => setTerm(x)}
                    key={x}
                  >
                    {x} mo
                  </button>
                ))}
              </div>
            </label>
            <label>
              Annual mileage
              <div>
                {[7500, 10000, 12000, 15000].map((x) => (
                  <button
                    className={miles === x ? "active" : ""}
                    onClick={() => setMiles(x)}
                    key={x}
                  >
                    {x.toLocaleString()}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Residual{" "}
              <b>
                {residual}% · {fmt(residualValue)}
              </b>
              <input
                type="range"
                min="40"
                max="75"
                value={residual}
                onChange={(e) => setResidual(Number(e.target.value))}
              />
            </label>
            <label>
              Money factor{" "}
              <b>
                {moneyFactor.toFixed(5)} · {apr.toFixed(2)}% APR equiv.
              </b>
              <input
                type="range"
                min="0.0001"
                max="0.005"
                step="0.00005"
                value={moneyFactor}
                onChange={(e) => setMoneyFactor(Number(e.target.value))}
              />
            </label>
            <label>
              Drive-off reduction <b>{fmt(driveOff)}</b>
              <input
                type="range"
                min="0"
                max="10000"
                step="250"
                value={driveOff}
                onChange={(e) => setDriveOff(Number(e.target.value))}
              />
            </label>
            <label>
              Tax method
              <div>
                <button
                  className={taxMode === "monthly" ? "active" : ""}
                  onClick={() => setTaxMode("monthly")}
                >
                  Tax payment
                </button>
                <button
                  className={taxMode === "upfront" ? "active" : ""}
                  onClick={() => setTaxMode("upfront")}
                >
                  Tax upfront
                </button>
              </div>
            </label>
          </div>
        </section>
        <section className="financePanel leaseOutput">
          <header>
            <div>
              <small>LEASE PAYMENT ENGINE</small>
              <h2>Transparent payment anatomy</h2>
            </div>
            <em>
              {term} MO · {miles.toLocaleString()} MI
            </em>
          </header>
          <div className="leasePayment">
            <small>ESTIMATED PAYMENT</small>
            <b>
              {fmt(leasePayment)}
              <i>/mo</i>
            </b>
            <span>{fmt(driveOff + upfrontTax)} estimated due at signing</span>
          </div>
          <div className="paymentAnatomy">
            {[
              ["Monthly depreciation", fmt(depreciation)],
              ["Monthly rent charge", fmt(rentCharge)],
              ["Monthly tax", fmt(monthlyTax)],
              ["Residual value", fmt(residualValue)],
              ["Total lease commitment", fmt(totalLease)],
              ["Effective monthly", fmt(totalLease / term)],
            ].map((x) => (
              <p key={x[0]}>
                <span>{x[0]}</span>
                <b>{x[1]}</b>
              </p>
            ))}
          </div>
        </section>
      </div>
      <section className="financePanel scenarioLab">
        <header>
          <div>
            <small>CYNCRO STRUCTURE DNA™</small>
            <h2>Three paths from the same deal</h2>
          </div>
          <button
            onClick={() => onFlash("AI structure optimization completed")}
          >
            ✦ Optimize with AI
          </button>
        </header>
        <div>
          {scenarios.map((s, i) => {
            const rVal = price * (s[2] / 100);
            const cap = Math.max(0, price + fees - rebate - equity - s[4]);
            const base = Math.max(0, (cap - rVal) / s[1] + (cap + rVal) * s[3]);
            const pay = base * (1 + combinedRate / 100);
            return (
              <article className={i === 1 ? "featured" : ""} key={s[0]}>
                <span>{i === 1 ? "RECOMMENDED" : "SCENARIO 0" + (i + 1)}</span>
                <h3>{s[0]}</h3>
                <b>
                  {fmt(pay)}
                  <i>/mo</i>
                </b>
                <p>
                  <span>Due at signing</span>
                  <strong>{fmt(s[4])}</strong>
                </p>
                <p>
                  <span>Term / residual</span>
                  <strong>
                    {s[1]} mo · {s[2]}%
                  </strong>
                </p>
                <p>
                  <span>Total commitment</span>
                  <strong>{fmt(pay * s[1] + s[4])}</strong>
                </p>
                <button onClick={() => onFlash(`${s[0]} scenario selected`)}>
                  Use this structure →
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <div className="taxDisclaimer">
        <b>Important calculation boundary</b>
        <p>
          This tool provides dealership estimates. Final tax and lease figures
          must be verified against current state, county, city, registration
          address, vehicle classification, incentives, lender program, DMV and
          dealer-specific rules before contracting.
        </p>
      </div>
    </div>
  );
}

function CalcInput({
  label,
  value,
  set,
}: {
  label: string;
  value: number;
  set: (n: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
}

const financeWorkspaceData: Record<
  Exclude<
    FinanceView,
    "Command" | "Deal Queue" | "Deal Architect" | "Tax & Lease Lab"
  >,
  {
    eyebrow: string;
    title: string;
    desc: string;
    action: string;
    metrics: string[][];
    sections: { title: string; rows: string[][] }[];
  }
> = {
  Lenders: {
    eyebrow: "INTELLIGENT LENDER NETWORK",
    title: "Route every deal to its strongest approval path.",
    desc: "Live program matrix, callback comparison, advance limits, stipulation patterns, reserve and funding-speed intelligence.",
    action: "Compare programs",
    metrics: [
      ["CONNECTED LENDERS", "42", "Live programs"],
      ["APPROVAL RATE", "81.6%", "+6.2%"],
      ["AVG CALLBACK", "4m 12s", "−38%"],
      ["RESERVE MTD", "$84.2K", "Protected"],
    ],
    sections: [
      {
        title: "Lender performance",
        rows: [
          [
            "Chase Auto",
            "86% approval",
            "1.4 day funding",
            "$1,425 avg reserve",
          ],
          [
            "Capital One Auto",
            "79% approval",
            "1.2 day funding",
            "$1,180 avg reserve",
          ],
          ["Ally", "82% approval", "1.8 day funding", "$1,695 avg reserve"],
        ],
      },
      {
        title: "Program opportunities",
        rows: [
          ["Prime loyalty", "6 eligible deals", "Up to −0.50%", "MATCH"],
          ["EV incentive", "3 eligible units", "$2,500 credit", "MATCH"],
          ["First-time buyer", "4 prospects", "Flexible history", "REVIEW"],
        ],
      },
    ],
  },
  "Product Menu": {
    eyebrow: "PERSONALIZED F&I PRESENTATION",
    title: "Build value—not pressure.",
    desc: "AI-personalized product recommendations, transparent option menus, e-signatures, declinations and penetration coaching.",
    action: "Create menu",
    metrics: [
      ["PVR", "$2,418", "+$284"],
      ["VSC PENETRATION", "54.8%", "+7.1%"],
      ["GAP PENETRATION", "46.2%", "Target 50%"],
      ["MENU COMPLETION", "98.6%", "Audited"],
    ],
    sections: [
      {
        title: "Live product performance",
        rows: [
          [
            "Vehicle Service Contract",
            "54.8% penetration",
            "$1,420 avg gross",
            "↑ 7.1%",
          ],
          ["GAP Protection", "46.2% penetration", "$684 avg gross", "↑ 3.8%"],
          ["Tire & Wheel", "31.9% penetration", "$790 avg gross", "↑ 5.2%"],
        ],
      },
      {
        title: "Customer-ready menus",
        rows: [
          ["Olivia Bennett", "Premium protection", "2 selected", "PRESENTING"],
          ["Noah Williams", "Essential protection", "1 selected", "REVIEW"],
          ["Sophia Carter", "Custom menu", "3 selected", "SIGNED"],
        ],
      },
    ],
  },
  Contracts: {
    eyebrow: "DIGITAL DEAL JACKET",
    title: "Contract once. Validate everything.",
    desc: "Remote signing, document generation, version control, missing-field detection, secure vault and accounting handoff.",
    action: "Generate contract",
    metrics: [
      ["CONTRACTING", "8", "Live deals"],
      ["E-SIGN RATE", "78%", "Remote + in-store"],
      ["AVG CONTRACT TIME", "11m", "−43%"],
      ["ERROR RATE", "0.4%", "Auto-validated"],
    ],
    sections: [
      {
        title: "Contract desk",
        rows: [
          ["Liam Rodriguez", "18/21 documents", "3 signatures", "IN PROGRESS"],
          ["Sophia Carter", "21/21 documents", "Complete", "READY TO FUND"],
          ["Noah Williams", "14/21 documents", "Lender pending", "ON HOLD"],
        ],
      },
      {
        title: "Document intelligence",
        rows: [
          [
            "Retail installment contract",
            "All fields validated",
            "Current version",
            "CLEAR",
          ],
          [
            "Buyer’s order",
            "Tax + fees reconciled",
            "Current version",
            "CLEAR",
          ],
          [
            "Privacy + credit notices",
            "Delivery confirmed",
            "Immutable proof",
            "CLEAR",
          ],
        ],
      },
    ],
  },
  Funding: {
    eyebrow: "CONTRACT-IN-TRANSIT CONTROL",
    title: "Turn signed deals into cash faster.",
    desc: "Funding packets, lender checklists, aging alerts, exception ownership, receivables, reserve reconciliation and chargeback risk.",
    action: "Open funding packet",
    metrics: [
      ["PENDING FUNDING", "$428.6K", "14 contracts"],
      ["AVG TIME TO FUND", "1.7 days", "−0.6 days"],
      ["EXCEPTIONS", "4", "2 urgent"],
      ["CHARGEBACK RISK", "$7.8K", "Protected"],
    ],
    sections: [
      {
        title: "Funding queue",
        rows: [
          ["Sophia Carter", "Mercedes-Benz FS", "$68,420", "STIP RECEIVED"],
          ["Liam Rodriguez", "Ally", "$74,880", "CONTRACT REVIEW"],
          ["Emma Davis", "Chase Auto", "$46,210", "FUNDED TODAY"],
        ],
      },
      {
        title: "Exceptions",
        rows: [
          ["Proof of income", "Noah Williams", "Owner: Jason", "2h SLA"],
          ["Insurance binder", "Sophia Carter", "Owner: Maya", "4h SLA"],
          ["Trade title", "Ethan Parker", "Owner: DMV desk", "1 day"],
        ],
      },
    ],
  },
  Compliance: {
    eyebrow: "CONTINUOUS DEAL COMPLIANCE",
    title: "Protect the customer, manager and rooftop.",
    desc: "OFAC, Red Flags, consent, adverse action, disclosures, identity, menu proof, audit trails and policy enforcement.",
    action: "Run deal audit",
    metrics: [
      ["DEALS AUDITED", "100%", "Automatic"],
      ["OPEN EXCEPTIONS", "3", "Owners assigned"],
      ["POLICY SCORE", "98.7", "Enterprise"],
      ["AUDIT EVIDENCE", "7 years", "Retained"],
    ],
    sections: [
      {
        title: "Automated controls",
        rows: [
          ["OFAC screening", "All active deals", "Real time", "ENFORCED"],
          [
            "Red Flags program",
            "Identity + anomaly review",
            "Risk based",
            "ENFORCED",
          ],
          [
            "Adverse action",
            "Trigger + notice tracking",
            "Automated",
            "ENFORCED",
          ],
        ],
      },
      {
        title: "Audit stream",
        rows: [
          ["Deal P24018", "Menu disclosure signed", "Yvette L.", "10:42 AM"],
          ["Deal M60117", "Credit consent verified", "System", "10:31 AM"],
          ["Deal A74221", "Rate change approved", "Dana P.", "10:08 AM"],
        ],
      },
    ],
  },
  Customers: {
    eyebrow: "ONE AUTOMOTIVE CUSTOMER RECORD",
    title: "See the complete relationship—not one transaction.",
    desc: "Identity, household, vehicles, trade equity, credit consent, communications, service history, documents and lifetime value.",
    action: "Add customer",
    metrics: [
      ["ACTIVE CUSTOMERS", "12,842", "All rooftops"],
      ["RETURNING BUYERS", "31.4%", "+4.8%"],
      ["POSITIVE EQUITY", "1,208", "Opportunities"],
      ["AVG LIFETIME VALUE", "$8,940", "Sales + service"],
    ],
    sections: [
      {
        title: "Priority customers",
        rows: [
          [
            "Olivia Bennett",
            "2026 Porsche Macan S",
            "$18.4K LTV",
            "IN DELIVERY",
          ],
          ["Noah Williams", "2025 BMW X5", "$11.2K LTV", "FINANCING"],
          ["Sophia Carter", "2026 Mercedes GLC", "$14.8K LTV", "STIPS"],
        ],
      },
      {
        title: "Equity opportunities",
        rows: [
          [
            "118 customers",
            "$5K+ positive equity",
            "0–36 months",
            "HIGH INTENT",
          ],
          ["264 customers", "Lease maturity <120d", "Campaign ready", "ENGAGE"],
          ["82 customers", "Payment reduction path", "AI matched", "REVIEW"],
        ],
      },
    ],
  },
  Analytics: {
    eyebrow: "MULTI-ROOFTOP FINANCE INTELLIGENCE",
    title: "Know exactly where profit moves—and why.",
    desc: "Real-time PVR, penetration, lender, funding, manager, compliance and chargeback analytics with AI explanations.",
    action: "Ask finance data",
    metrics: [
      ["TOTAL GROSS MTD", "$1.28M", "+11.7%"],
      ["BACK GROSS", "$486K", "38% mix"],
      ["DEALS FUNDED", "214", "96% clean"],
      ["FORECAST", "$1.62M", "103% target"],
    ],
    sections: [
      {
        title: "Manager performance",
        rows: [
          ["Yvette Lomeli", "$2,684 PVR", "74% products", "112% target"],
          ["Dana Pierce", "$2,420 PVR", "68% products", "104% target"],
          ["Jason Cole", "$2,186 PVR", "61% products", "96% target"],
        ],
      },
      {
        title: "Rooftop comparison",
        rows: [
          ["Vivid Premier West", "$2,590 PVR", "1.4d fund", "LEADER"],
          ["Vivid Premier Central", "$2,402 PVR", "1.8d fund", "ON PACE"],
          ["Vivid Premier North", "$2,110 PVR", "2.6d fund", "COACH"],
        ],
      },
    ],
  },
};

function FinanceWorkspace({
  view,
  onFlash,
}: {
  view: Exclude<
    FinanceView,
    "Command" | "Deal Queue" | "Deal Architect" | "Tax & Lease Lab"
  >;
  onFlash: (m: string) => void;
}) {
  const d = financeWorkspaceData[view];
  return (
    <div className="financeWorkspace">
      <div className="financePageHead">
        <div>
          <span>{d.eyebrow}</span>
          <h1>{d.title}</h1>
          <p>{d.desc}</p>
        </div>
        <button onClick={() => onFlash(`${d.action} opened`)}>
          {d.action} →
        </button>
      </div>
      <section className="financeKpis">
        {d.metrics.map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>{x[2]}</span>
          </article>
        ))}
      </section>
      <div className="financeDataGrid">
        {d.sections.map((s) => (
          <section className="financePanel financeDataTable" key={s.title}>
            <header>
              <div>
                <small>LIVE OPERATIONS</small>
                <h2>{s.title}</h2>
              </div>
              <button onClick={() => onFlash(`${s.title} controls opened`)}>
                Manage →
              </button>
            </header>
            {s.rows.map((r, i) => (
              <button
                onClick={() => onFlash(`${r[0]} opened`)}
                key={`${r[0]}-${i}`}
              >
                {r.map((c, j) => (
                  <span className={j === 0 ? "primary" : ""} key={`${c}-${j}`}>
                    {c}
                  </span>
                ))}
              </button>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function FinanceAI({
  onClose,
  onFlash,
}: {
  onClose: () => void;
  onFlash: (m: string) => void;
}) {
  return (
    <aside className="financeAI">
      <header>
        <div>
          <span>✦</span>
          <div>
            <b>Cyncro Finance AI</b>
            <small>Deal-aware intelligence</small>
          </div>
        </div>
        <button onClick={onClose}>×</button>
      </header>
      <div className="aiContext">
        <span>LIVE BOOK CONTEXT</span>
        <b>18 active deals · $126K gross</b>
        <small>42 lender programs · 4 exceptions</small>
      </div>
      <div className="aiConversation">
        <p>Where should I focus right now?</p>
        <article>
          <b>Three actions can protect approximately $18,420 in gross today.</b>
          <ol>
            <li>Move Noah Williams to Capital One’s current tier.</li>
            <li>Resolve Sophia Carter’s income stipulation.</li>
            <li>Re-present GAP on four high-LTV deals.</li>
          </ol>
        </article>
      </div>
      <div className="aiPrompts">
        {[
          "Optimize today’s deal book",
          "Find funding delays",
          "Compare manager PVR",
        ].map((x) => (
          <button key={x} onClick={() => onFlash(`${x} analysis generated`)}>
            {x} →
          </button>
        ))}
      </div>
      <label>
        <input placeholder="Ask about any deal, lender or KPI…" />
        <button onClick={() => onFlash("AI analysis generated")}>↑</button>
      </label>
      <footer>AI recommendations require authorized manager review.</footer>
    </aside>
  );
}

type DispatchRole = "Owner" | "Dispatcher" | "Technician";
type DispatchView =
  | "Dashboard"
  | "Jobs"
  | "Work Orders"
  | "Payments"
  | "GPS Map"
  | "Analytics"
  | "AI Agents"
  | "Equipment"
  | "Team"
  | "Settings";

const dispatchJobs = [
  {
    id: "JOB-2841",
    time: "8:30 AM",
    customer: "Morrison Residence",
    service: "Home theater calibration",
    address: "145 Ocean Breeze Dr, Wellington",
    tech: "Andre Cole",
    status: "IN PROGRESS",
    revenue: "$1,850",
    eta: "On site",
    color: "red",
  },
  {
    id: "JOB-2842",
    time: "11:15 AM",
    customer: "Atlas Dental Group",
    service: "Digital signage service",
    address: "2101 S Congress Ave, Palm Springs",
    tech: "Andre Cole",
    status: "ASSIGNED",
    revenue: "$2,400",
    eta: "24 min",
    color: "amber",
  },
  {
    id: "JOB-2843",
    time: "1:45 PM",
    customer: "Carter Collective",
    service: "Access control installation",
    address: "675 Royal Palm Beach Blvd",
    tech: "Maya Torres",
    status: "ASSIGNED",
    revenue: "$4,200",
    eta: "38 min",
    color: "blue",
  },
  {
    id: "JOB-2844",
    time: "3:30 PM",
    customer: "Villa Rosa HOA",
    service: "Camera system inspection",
    address: "880 Forest Hill Blvd, WPB",
    tech: "Derek Stone",
    status: "BOOKED",
    revenue: "$975",
    eta: "1 hr 12 min",
    color: "green",
  },
];

function CyncroDispatch() {
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<DispatchRole>("Owner");
  const [view, setView] = useState<DispatchView>("Dashboard");
  const [notice, setNotice] = useState("");
  const [jobs, setJobs] = useState(dispatchJobs);
  const [selectedJob, setSelectedJob] = useState(0);
  const [techStatus, setTechStatus] = useState("EN ROUTE");
  const [loginEmail, setLoginEmail] = useState("");
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };
  const login = (nextRole: DispatchRole) => {
    setRole(nextRole);
    setAuthenticated(true);
    setView(nextRole === "Technician" ? "Jobs" : "Dashboard");
    flash(`${nextRole} workspace unlocked`);
  };
  const moveJob = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= jobs.length) return;
    const next = [...jobs];
    [next[index], next[target]] = [next[target], next[index]];
    setJobs(next);
    setSelectedJob(target);
    flash("Route order updated · ETA recalculated");
  };
  const createJob = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const customer = String(data.get("customer") || "").trim();
    const service = String(data.get("service") || "").trim();
    const address = String(data.get("address") || "").trim();
    if (!customer || !service || !address) {
      flash("Customer, service, and address are required");
      return;
    }
    const newJob = {
      id: `JOB-${2841 + jobs.length}`,
      time: String(data.get("time") || "9:00 AM"),
      customer,
      service,
      address,
      tech: String(data.get("tech") || "Unassigned"),
      status: "BOOKED",
      revenue: `$${Number(data.get("revenue") || 0).toLocaleString()}`,
      eta: "Not routed",
      color: "green",
    };
    setJobs((current) => [...current, newJob]);
    setSelectedJob(jobs.length);
    setView("Jobs");
    setJobModalOpen(false);
    flash(`${newJob.id} created`);
  };
  const advanceJob = (index: number) => {
    const lifecycle = [
      "BOOKED",
      "ASSIGNED",
      "IN PROGRESS",
      "COMPLETE",
      "INVOICED",
    ];
    setJobs((current) =>
      current.map((job, jobIndex) => {
        if (jobIndex !== index) return job;
        const next =
          lifecycle[
            Math.min(lifecycle.indexOf(job.status) + 1, lifecycle.length - 1)
          ];
        return { ...job, status: next };
      }),
    );
    flash("Job status advanced");
  };
  const cancelJob = (index: number) => {
    setJobs((current) => current.filter((_, jobIndex) => jobIndex !== index));
    setSelectedJob(0);
    flash("Job cancelled");
  };

  if (!authenticated) {
    return (
      <section className="dispatchGate">
        {notice && <div className="dispatchToast">✓ {notice}</div>}
        <div className="dispatchGateGlow" />
        <div className="dispatchGateCopy">
          <span>CYNCRO FIELD OPERATIONS</span>
          <h1>
            Cyncro <i>Dispatch</i>
          </h1>
          <p>
            The command system for contractors—jobs, crews, GPS, routes,
            customers, revenue, and AI agents operating as one.
          </p>
          <div className="dispatchGateProof">
            <span>◆ Live field visibility</span>
            <span>◆ AI booking + follow-up</span>
            <span>◆ Profit on every job</span>
          </div>
          <div
            className="dispatchProductPreview"
            aria-label="Dispatch live operation preview"
          >
            <header>
              <span>LIVE FIELD OPERATION</span>
              <b>4 crews active</b>
            </header>
            <div className="miniDispatchMap">
              <i className="miniRoute routeOne" />
              <i className="miniRoute routeTwo" />
              {[
                ["AC", "22%", "63%"],
                ["MT", "58%", "28%"],
                ["DS", "76%", "71%"],
              ].map((tech) => (
                <button style={{ left: tech[1], top: tech[2] }} key={tech[0]}>
                  {tech[0]}
                  <small>● moving</small>
                </button>
              ))}
              <span className="miniJob one">1</span>
              <span className="miniJob two">2</span>
              <span className="miniJob three">3</span>
            </div>
            <footer>
              <div>
                <small>BOOKED TODAY</small>
                <b>$9,425</b>
              </div>
              <div>
                <small>ON-TIME RATE</small>
                <b>96.8%</b>
              </div>
              <div>
                <small>DRIVE TIME SAVED</small>
                <b>2h 14m</b>
              </div>
            </footer>
          </div>
        </div>

        <aside className="dispatchLoginCard">
          <div className="dispatchMark">D</div>
          <small>CONTRACTOR ACCESS</small>
          <h2>Enter Dispatch</h2>
          <p>Separate, secure access for every company and field role.</p>
          <label>
            Work email
            <input
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              defaultValue="dispatch2026"
              aria-label="Dispatch password"
            />
          </label>
          <button className="dispatchSignIn" onClick={() => login("Owner")}>
            Sign in to Dispatch →
          </button>
          <button
            className="dispatchSSO"
            onClick={() => flash("Secure sign-in prepared")}
          >
            Continue with company SSO
          </button>
          <div className="demoRolePicker">
            <span>EXPLORE ROLE DEMOS</span>
            <div>
              {(["Owner", "Dispatcher", "Technician"] as DispatchRole[]).map(
                (item) => (
                  <button onClick={() => login(item)} key={item}>
                    {item}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="dispatchPlan">
            <div>
              <small>DISPATCH PROFESSIONAL</small>
              <b>
                $249<em>/month</em>
              </b>
            </div>
            <span>Up to 10 technicians · Cancel anytime</span>
            <button onClick={() => flash("Dispatch checkout opened")}>
              Start contractor account
            </button>
          </div>
          <footer>
            Protected by role-based access · Your crews only see assigned work.
          </footer>
        </aside>
      </section>
    );
  }

  if (role === "Technician") {
    return (
      <section className="techAppStage">
        {notice && <div className="dispatchToast">✓ {notice}</div>}
        <div className="techStageCopy">
          <button
            className="backToDispatch"
            onClick={() => setAuthenticated(false)}
          >
            ← Contractor login
          </button>
          <span>CYNCRO DISPATCH · TECH APP</span>
          <h1>
            Built for the field.
            <br />
            Impossible to mess up.
          </h1>
          <p>
            Only today’s assigned work, the fastest route, clear job steps, and
            one-tap proof of completion.
          </p>
          <div className="offlineReady">
            <i>✓</i>
            <div>
              <b>Offline ready</b>
              <small>
                Jobs, photos, notes, and signatures sync when service returns.
              </small>
            </div>
          </div>
          <div className="techDemoControls">
            <button onClick={() => setTechStatus("ARRIVED")}>
              Simulate arrival
            </button>
            <button onClick={() => setTechStatus("COMPLETE")}>
              Complete job
            </button>
            <button
              onClick={() => {
                setRole("Owner");
                setView("Dashboard");
              }}
            >
              Open owner view
            </button>
          </div>
        </div>
        <div className="phoneShell">
          <div className="phoneBar">
            <span>9:41</span>
            <i>● ● ◼</i>
          </div>
          <header>
            <div>
              <small>THURSDAY · AUG 13</small>
              <h2>Good morning, Andre.</h2>
            </div>
            <span>AC</span>
          </header>
          <div className="techStatusStrip">
            <i>●</i>
            <span>
              <b>
                {techStatus === "COMPLETE"
                  ? "Job completed"
                  : techStatus === "ARRIVED"
                    ? "You’ve arrived at Job 1"
                    : "Route optimized"}
              </b>
              <small>
                {techStatus === "COMPLETE"
                  ? "Invoice + owner SMS sent"
                  : techStatus === "ARRIVED"
                    ? "Geofence verified · Timer started"
                    : "31 minutes of drive time saved"}
              </small>
            </span>
          </div>
          <nav>
            <button className="active">Today</button>
            <button onClick={() => flash("Route map opened")}>Route</button>
            <button onClick={() => flash("Tech profile opened")}>
              Profile
            </button>
          </nav>
          <main>
            <div className="nextJobLabel">
              <span>NEXT JOB</span>
              <em>1 OF 3</em>
            </div>
            <article className="mobileJobCard">
              <div className="mobileJobMap">
                <span>AC</span>
                <i>1</i>
                <em>8 min · 3.2 mi</em>
              </div>
              <div className="mobileJobBody">
                <small>
                  {jobs[0].id} · {jobs[0].time}
                </small>
                <h3>{jobs[0].customer}</h3>
                <p>{jobs[0].service}</p>
                <address>{jobs[0].address}</address>
                <div>
                  <button
                    onClick={() => flash("Turn-by-turn navigation opened")}
                  >
                    Navigate
                  </button>
                  <button onClick={() => setTechStatus("ARRIVED")}>
                    {techStatus === "ARRIVED" ? "✓ Arrived" : "I’ve arrived"}
                  </button>
                </div>
              </div>
            </article>
            <div className="workOrderMobile">
              <header>
                <span>WORK ORDER</span>
                <b>Scope + customer notes</b>
              </header>
              <p>
                Diagnose audio zones, calibrate speakers, verify network
                control, and demonstrate final settings to customer.
              </p>
              <button onClick={() => flash("Before photo captured")}>
                ＋ Before photo
              </button>
              <button onClick={() => flash("Field note saved")}>
                ＋ Add note
              </button>
              <button onClick={() => flash("Signature captured")}>
                ✎ Capture signature
              </button>
            </div>
            <button
              className="completeMobileJob"
              onClick={() => {
                setTechStatus("COMPLETE");
                flash("Job complete · Invoice and SMS triggered");
              }}
            >
              Mark job complete
            </button>
          </main>
          <footer>
            <button className="active">
              ▦<small>Jobs</small>
            </button>
            <button>
              ⌖<small>Route</small>
            </button>
            <button>
              ◎<small>Account</small>
            </button>
          </footer>
        </div>
      </section>
    );
  }

  const navItems: { name: DispatchView; icon: string }[] = [
    { name: "Dashboard", icon: "⌂" },
    { name: "Jobs", icon: "▦" },
    { name: "Work Orders", icon: "▤" },
    { name: "Payments", icon: "$" },
    { name: "GPS Map", icon: "⌖" },
    { name: "Analytics", icon: "⌁" },
    { name: "AI Agents", icon: "✦" },
    { name: "Equipment", icon: "◇" },
    { name: "Team", icon: "◎" },
    { name: "Settings", icon: "⚙" },
  ];
  return (
    <section className="dispatchShell">
      {notice && <div className="dispatchToast">✓ {notice}</div>}
      {jobModalOpen && (
        <div className="dispatchModalBackdrop" role="presentation">
          <form className="dispatchModal" onSubmit={createJob}>
            <header>
              <div>
                <small>JOB COMMAND</small>
                <h2>Create a field job</h2>
              </div>
              <button
                type="button"
                onClick={() => setJobModalOpen(false)}
                aria-label="Close new job form"
              >
                ×
              </button>
            </header>
            <label>
              Customer
              <input
                name="customer"
                placeholder="Customer or company"
                required
              />
            </label>
            <label>
              Service
              <input name="service" placeholder="Service requested" required />
            </label>
            <label>
              Job address
              <input
                name="address"
                placeholder="Full service address"
                required
              />
            </label>
            <div>
              <label>
                Time
                <input name="time" type="time" defaultValue="09:00" required />
              </label>
              <label>
                Estimated revenue
                <input
                  name="revenue"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="500"
                />
              </label>
            </div>
            <label>
              Assign technician
              <select name="tech" defaultValue="Unassigned">
                <option>Unassigned</option>
                <option>Andre Cole</option>
                <option>Maya Torres</option>
                <option>Derek Stone</option>
              </select>
            </label>
            <footer>
              <button type="button" onClick={() => setJobModalOpen(false)}>
                Cancel
              </button>
              <button type="submit">Create job →</button>
            </footer>
          </form>
        </div>
      )}
      <aside className="dispatchSidebar">
        <div className="dispatchBrand">
          <span>D</span>
          <div>
            <b>Cyncro Dispatch</b>
            <small>CTS Audio Video</small>
          </div>
        </div>
        <div className="dispatchRole">
          <small>ACTIVE WORKSPACE</small>
          <button
            onClick={() => setRole(role === "Owner" ? "Dispatcher" : "Owner")}
          >
            <span>{role === "Owner" ? "YL" : "DP"}</span>
            <div>
              <b>{role}</b>
              <small>
                {role === "Owner" ? "Full company access" : "Field operations"}
              </small>
            </div>
            <i>⌄</i>
          </button>
        </div>
        <nav>
          {navItems
            .filter(
              (item) =>
                role === "Owner" ||
                !["Analytics", "Payments", "Settings"].includes(item.name),
            )
            .map((item) => (
              <button
                className={view === item.name ? "active" : ""}
                onClick={() => setView(item.name)}
                key={item.name}
              >
                <i>{item.icon}</i>
                <span>{item.name}</span>
                {item.name === "Jobs" && <em>12</em>}
                {item.name === "AI Agents" && (
                  <em className="agentLive">LIVE</em>
                )}
              </button>
            ))}
        </nav>
        <div className="dispatchSideSystem">
          <small>CONNECTED PLATFORM</small>
          <button onClick={() => flash("Cyncro CRM opened")}>
            <i>◫</i>
            <span>Cyncro CRM</span>
            <em>↗</em>
          </button>
          <button onClick={() => flash("Universal Calendar opened")}>
            <i>□</i>
            <span>Calendar</span>
            <em>↗</em>
          </button>
        </div>
        <div className="dispatchSubscription">
          <span>PRO</span>
          <div>
            <b>Dispatch Professional</b>
            <small>$249/mo · 7 of 10 techs</small>
          </div>
          <button onClick={() => setAuthenticated(false)}>•••</button>
        </div>
      </aside>
      <main className="dispatchMain">
        <header className="dispatchTopbar">
          <div>
            <small>THURSDAY, AUGUST 13</small>
            <b>{view === "Dashboard" ? `${role} Command Center` : view}</b>
          </div>
          <div>
            <button onClick={() => flash("Search opened")}>⌕</button>
            <button onClick={() => flash("No dispatch alerts")}>
              ◌<i />
            </button>
            <button onClick={() => setJobModalOpen(true)}>＋ New job</button>
          </div>
        </header>
        <div className="dispatchContent">
          {view === "Dashboard" && (
            <DispatchDashboard
              jobs={jobs}
              onView={setView}
              onFlash={flash}
              onMove={moveJob}
              role={role}
            />
          )}
          {view === "Jobs" && (
            <DispatchJobs
              jobs={jobs}
              selected={selectedJob}
              setSelected={setSelectedJob}
              onFlash={flash}
              onNew={() => setJobModalOpen(true)}
              onAdvance={advanceJob}
              onCancel={cancelJob}
            />
          )}
          {view === "Work Orders" && (
            <DispatchWorkOrders
              jobs={jobs}
              onFlash={flash}
              onViewJob={(index) => {
                setSelectedJob(index);
                setView("Jobs");
              }}
            />
          )}
          {view === "Payments" && <DispatchPayments onFlash={flash} />}
          {view === "GPS Map" && (
            <DispatchMap jobs={jobs} onFlash={flash} onMove={moveJob} />
          )}
          {view === "Analytics" && <DispatchAnalytics onFlash={flash} />}
          {view === "AI Agents" && <DispatchAgents onFlash={flash} />}
          {view === "Equipment" && <DispatchEquipment onFlash={flash} />}
          {view === "Team" && (
            <DispatchTeam
              onTech={() => setRole("Technician")}
              onFlash={flash}
            />
          )}
          {view === "Settings" && <DispatchSettings onFlash={flash} />}
        </div>
      </main>
    </section>
  );
}

function DispatchDashboard({
  jobs,
  onView,
  onFlash,
  onMove,
  role,
}: {
  jobs: typeof dispatchJobs;
  onView: (view: DispatchView) => void;
  onFlash: (message: string) => void;
  onMove: (index: number, direction: number) => void;
  role: DispatchRole;
}) {
  return (
    <>
      <div className="dispatchPageHead">
        <div>
          <span>LIVE FIELD INTELLIGENCE</span>
          <h1>
            {role === "Owner"
              ? "Your field business, in motion."
              : "Every crew. Every job. Right now."}
          </h1>
          <p>
            Real-time jobs, crews, routes, revenue, and exceptions—one command
            surface.
          </p>
        </div>
        <button onClick={() => onFlash("Daily dispatch brief generated")}>
          ✦ Generate daily brief
        </button>
      </div>
      <div className="dispatchMetrics">
        {[
          ["BOOKED THIS WEEK", "$48,250", "+18.4%"],
          ["COLLECTED", "$36,840", "+$7.2K"],
          ["OUTSTANDING", "$11,410", "8 invoices"],
          ["JOBS COMPLETED", "42", "96.8% on time"],
        ].map((item) => (
          <article key={item[0]}>
            <small>{item[0]}</small>
            <b>{item[1]}</b>
            <span>{item[2]}</span>
          </article>
        ))}
      </div>
      <div className="dispatchDashboardGrid">
        <section className="liveOpsMap dispatchPanel">
          <header>
            <div>
              <small>LIVE GPS COMMAND</small>
              <h2>4 crews · 12 jobs</h2>
            </div>
            <button onClick={() => onView("GPS Map")}>Full map →</button>
          </header>
          <div className="mapSurface">
            <i className="mapRoad r1" />
            <i className="mapRoad r2" />
            <i className="mapRoad r3" />
            {[
              ["AC", "24%", "56%", "On site"],
              ["MT", "61%", "28%", "Moving"],
              ["DS", "77%", "68%", "18 min away"],
            ].map((tech) => (
              <button
                style={{ left: tech[1], top: tech[2] }}
                onClick={() => onFlash(`${tech[0]} location opened`)}
                key={tech[0]}
              >
                <span>{tech[0]}</span>
                <b>{tech[3]}</b>
              </button>
            ))}
            {jobs.map((job, index) => (
              <i className={`jobPin pin${index + 1}`} key={job.id}>
                {index + 1}
              </i>
            ))}
          </div>
          <footer>
            <span>
              <i className="moving" /> Moving
            </span>
            <span>
              <i className="onsite" /> On site
            </span>
            <span>
              <i className="available" /> Available
            </span>
            <b>Updated 8 sec ago</b>
          </footer>
        </section>
        <section className="routeCommand dispatchPanel">
          <header>
            <div>
              <small>ROUTE OPTIMIZATION</small>
              <h2>Andre Cole · 3 jobs</h2>
            </div>
            <span>31 min saved</span>
          </header>
          <div className="routeList">
            {jobs.slice(0, 3).map((job, index) => (
              <article key={job.id}>
                <span>{index + 1}</span>
                <div>
                  <b>
                    {job.time} · {job.customer}
                  </b>
                  <small>{job.service}</small>
                </div>
                <em>{job.eta}</em>
                <div>
                  <button onClick={() => onMove(index, -1)}>↑</button>
                  <button onClick={() => onMove(index, 1)}>↓</button>
                </div>
              </article>
            ))}
          </div>
          <button
            className="optimizeRoute"
            onClick={() => onFlash("Optimal route applied · 31 minutes saved")}
          >
            ✦ Optimize route now
          </button>
        </section>
        <section className="todayDispatch dispatchPanel">
          <header>
            <div>
              <small>TODAY'S DISPATCH</small>
              <h2>Live job board</h2>
            </div>
            <button onClick={() => onView("Jobs")}>All jobs →</button>
          </header>
          {jobs.map((job) => (
            <button onClick={() => onView("Jobs")} key={job.id}>
              <time>{job.time}</time>
              <i className={job.color} />
              <span>
                <b>{job.customer}</b>
                <small>
                  {job.tech} · {job.service}
                </small>
              </span>
              <em>{job.status}</em>
              <strong>{job.revenue}</strong>
            </button>
          ))}
        </section>
        <section className="techProductivity dispatchPanel">
          <header>
            <div>
              <small>TECH PRODUCTIVITY</small>
              <h2>Revenue per billable hour</h2>
            </div>
            <button onClick={() => onView("Analytics")}>Analyze →</button>
          </header>
          {[
            ["AC", "Andre Cole", "$78/hr", "+14%", "84%"],
            ["MT", "Maya Torres", "$72/hr", "+9%", "77%"],
            ["DS", "Derek Stone", "$68/hr", "+6%", "69%"],
          ].map((tech) => (
            <div key={tech[1]}>
              <i>{tech[0]}</i>
              <span>
                <b>{tech[1]}</b>
                <small>
                  {tech[2]} · {tech[3]} WoW
                </small>
              </span>
              <em>
                <i style={{ width: tech[4] }} />
              </em>
              <strong>{tech[4]}</strong>
            </div>
          ))}
        </section>
        <section className="agentRevenue dispatchPanel">
          <header>
            <div>
              <small>AI AGENT PERFORMANCE</small>
              <h2>Revenue created automatically</h2>
            </div>
            <button onClick={() => onView("AI Agents")}>Agent center →</button>
          </header>
          <div className="agentRevenueHero">
            <span>✦</span>
            <div>
              <b>$15,420</b>
              <small>FROM SETTER FOLLOW-UPS THIS MONTH</small>
            </div>
            <em>18.2% close rate</em>
          </div>
          {[
            ["Receptionist", "81% booking conversion", "+6%"],
            ["Setter", "42 leads recovered", "$15.4K"],
            ["Learning system", "3 new insights ready", "Review"],
          ].map((item) => (
            <button onClick={() => onView("AI Agents")} key={item[0]}>
              <span>
                <b>{item[0]}</b>
                <small>{item[1]}</small>
              </span>
              <em>{item[2]}</em>
            </button>
          ))}
        </section>
        <section className="profitPulse dispatchPanel">
          <header>
            <div>
              <small>PROFITABILITY</small>
              <h2>Live job economics</h2>
            </div>
            <button onClick={() => onView("Analytics")}>Details →</button>
          </header>
          <div className="profitRing">
            <span>
              <b>38.4%</b>
              <small>NET MARGIN</small>
            </span>
          </div>
          <div className="profitFacts">
            <span>
              <small>REVENUE</small>
              <b>$48,250</b>
            </span>
            <span>
              <small>LABOR</small>
              <b>$12,840</b>
            </span>
            <span>
              <small>MATERIALS</small>
              <b>$16,880</b>
            </span>
            <span>
              <small>PROFIT</small>
              <b>$18,530</b>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}

function DispatchJobs({
  jobs,
  selected,
  setSelected,
  onFlash,
  onNew,
  onAdvance,
  onCancel,
}: {
  jobs: typeof dispatchJobs;
  selected: number;
  setSelected: (index: number) => void;
  onFlash: (message: string) => void;
  onNew: () => void;
  onAdvance: (index: number) => void;
  onCancel: (index: number) => void;
}) {
  const job = jobs[selected];
  const [inspectorTab, setInspectorTab] = useState<
    "Overview" | "Notes" | "Photos" | "Time" | "Work order"
  >("Overview");
  const [notes, setNotes] = useState<Record<string, string[]>>({
    "JOB-2841": [
      "Customer reports rear-zone audio dropping after 20 minutes.",
      "Network test passed. Replaced damaged HDMI termination and recalibrated system.",
    ],
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [photos, setPhotos] = useState<Record<string, string[]>>({
    "JOB-2841": ["Before · rack wiring.jpg", "After · calibrated theater.jpg"],
  });
  const [clockedIn, setClockedIn] = useState<Record<string, boolean>>({});
  const [elapsed, setElapsed] = useState<Record<string, number>>({
    "JOB-2841": 94,
  });
  const addNote = () => {
    const clean = noteDraft.trim();
    if (!clean) return;
    setNotes((current) => ({
      ...current,
      [job.id]: [...(current[job.id] || []), clean],
    }));
    setNoteDraft("");
    onFlash("Technical note saved to work order");
  };
  const addPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPhotos((current) => ({
      ...current,
      [job.id]: [...(current[job.id] || []), ...files.map((file) => file.name)],
    }));
    onFlash(`${files.length} job photo${files.length > 1 ? "s" : ""} added`);
    event.target.value = "";
  };
  const toggleClock = () => {
    const isIn = !!clockedIn[job.id];
    setClockedIn((current) => ({ ...current, [job.id]: !isIn }));
    if (isIn) {
      setElapsed((current) => ({
        ...current,
        [job.id]: (current[job.id] || 0) + 47,
      }));
    }
    onFlash(
      isIn ? "Clocked out · labor entry saved" : "Clocked in · GPS verified",
    );
  };
  if (!job) {
    return (
      <div className="dispatchEmptyState dispatchPanel">
        <small>JOB COMMAND</small>
        <h1>No jobs scheduled</h1>
        <p>Create the first job to begin dispatching your team.</p>
        <button onClick={onNew}>＋ Create job</button>
      </div>
    );
  }
  return (
    <div className="dispatchJobsWorkspace">
      <section className="jobBoard dispatchPanel">
        <header>
          <div>
            <small>JOB COMMAND</small>
            <h1>All field work</h1>
          </div>
          <div>
            <button onClick={() => onFlash("Job filters opened")}>
              Filter
            </button>
            <button onClick={onNew}>＋ Job</button>
          </div>
        </header>
        <div className="jobBoardCols">
          <span>JOB + CUSTOMER</span>
          <span>TECH</span>
          <span>STATUS</span>
          <span>VALUE</span>
        </div>
        {jobs.map((item, index) => (
          <button
            className={selected === index ? "active" : ""}
            onClick={() => setSelected(index)}
            key={item.id}
          >
            <span>
              <i>{index + 1}</i>
              <div>
                <b>{item.customer}</b>
                <small>
                  {item.id} · {item.service}
                  <br />
                  {item.address}
                </small>
              </div>
            </span>
            <strong>{item.tech}</strong>
            <em>{item.status}</em>
            <b>{item.revenue}</b>
          </button>
        ))}
      </section>
      <aside className="jobInspector dispatchPanel">
        <header>
          <div>
            <small>WORK ORDER</small>
            <h2>{job.id}</h2>
          </div>
          <button onClick={() => onFlash("Job actions opened")}>•••</button>
        </header>
        <span className="jobStatusLarge">● {job.status}</span>
        <h3>{job.customer}</h3>
        <p>{job.service}</p>
        <address>{job.address}</address>
        <nav className="jobInspectorTabs" aria-label="Job record sections">
          {(["Overview", "Notes", "Photos", "Time", "Work order"] as const).map(
            (tab) => (
              <button
                className={inspectorTab === tab ? "active" : ""}
                onClick={() => setInspectorTab(tab)}
                key={tab}
              >
                {tab}
              </button>
            ),
          )}
        </nav>
        {inspectorTab === "Overview" && (
          <>
            <div className="jobTimeline">
              {[
                ["BOOKED", "Calendar created job", "8:02 AM"],
                ["ASSIGNED", `${job.tech} assigned`, "8:05 AM"],
                ["EN ROUTE", "GPS tracking started", "8:18 AM"],
                ["ARRIVED", "Geofence verified", "8:29 AM"],
              ].map((event, index) => (
                <div className={index < 3 ? "done" : ""} key={event[0]}>
                  <i>{index < 3 ? "✓" : ""}</i>
                  <span>
                    <b>{event[0]}</b>
                    <small>{event[1]}</small>
                  </span>
                  <time>{event[2]}</time>
                </div>
              ))}
            </div>
            <div className="jobEconomics">
              {[
                ["Revenue", job.revenue],
                ["Labor", "$420"],
                ["Materials", "$315"],
                ["Projected profit", "$1,115"],
              ].map((item) => (
                <span key={item[0]}>
                  <small>{item[0]}</small>
                  <b>{item[1]}</b>
                </span>
              ))}
            </div>
            <button
              onClick={() => onFlash("Customer update queued for SMS delivery")}
            >
              Send customer update
            </button>
            <button onClick={() => onAdvance(selected)}>
              Advance job status
            </button>
            <button className="dangerAction" onClick={() => onCancel(selected)}>
              Cancel job
            </button>
          </>
        )}
        {inspectorTab === "Notes" && (
          <div className="jobRecordPanel">
            <header>
              <div>
                <small>FIELD NOTES</small>
                <b>{(notes[job.id] || []).length} entries</b>
              </div>
              <span>Visible to office + assigned tech</span>
            </header>
            <div className="jobNotesList">
              {(notes[job.id] || []).map((note, index) => (
                <article key={`${job.id}-${index}`}>
                  <i>{index + 1}</i>
                  <div>
                    <p>{note}</p>
                    <small>
                      {job.tech} · Today, {index ? "10:42 AM" : "9:18 AM"}
                    </small>
                  </div>
                </article>
              ))}
              {!(notes[job.id] || []).length && (
                <p className="emptyRecord">
                  No notes yet. Add diagnostics, work performed, unresolved
                  issues, or next steps.
                </p>
              )}
            </div>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Add technical notes, findings, parts used, recommendations…"
            />
            <button onClick={addNote}>＋ Save job note</button>
          </div>
        )}
        {inspectorTab === "Photos" && (
          <div className="jobRecordPanel">
            <header>
              <div>
                <small>JOB DOCUMENTATION</small>
                <b>{(photos[job.id] || []).length} uploads</b>
              </div>
              <span>Before · after · serials · test results</span>
            </header>
            <div className="jobPhotoGrid">
              {(photos[job.id] || []).map((photo, index) => (
                <article key={`${photo}-${index}`}>
                  <div>
                    <span>{index % 2 ? "AFTER" : "BEFORE"}</span>▧
                  </div>
                  <b>{photo}</b>
                  <small>Uploaded by {job.tech}</small>
                </article>
              ))}
            </div>
            <label className="photoUploadButton">
              ＋ Upload job photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={addPhotos}
              />
            </label>
          </div>
        )}
        {inspectorTab === "Time" && (
          <div className="jobRecordPanel timeClockPanel">
            <header>
              <div>
                <small>GPS-VERIFIED TIME</small>
                <b>{clockedIn[job.id] ? "Shift active" : "Not clocked in"}</b>
              </div>
              <span>Geofence · labor · drive time</span>
            </header>
            <div className={`clockHero ${clockedIn[job.id] ? "active" : ""}`}>
              <span>{clockedIn[job.id] ? "● LIVE" : "○ READY"}</span>
              <b>
                {Math.floor((elapsed[job.id] || 0) / 60)}h{" "}
                {(elapsed[job.id] || 0) % 60}m
              </b>
              <small>Total labor recorded</small>
            </div>
            <button className="clockAction" onClick={toggleClock}>
              {clockedIn[job.id]
                ? "Clock out and save time"
                : "Clock in to this job"}
            </button>
            <div className="timeEntries">
              <article>
                <span>Arrival verified</span>
                <b>8:29 AM</b>
              </article>
              <article>
                <span>Drive time</span>
                <b>24 min</b>
              </article>
              <article>
                <span>Billable labor</span>
                <b>{elapsed[job.id] || 0} min</b>
              </article>
            </div>
          </div>
        )}
        {inspectorTab === "Work order" && (
          <div className="jobRecordPanel workOrderDetail">
            <header>
              <div>
                <small>WORK ORDER {job.id}</small>
                <b>Authorized scope</b>
              </div>
              <span>Customer sign-off required</span>
            </header>
            <section>
              <small>SCOPE OF WORK</small>
              <p>
                Diagnose reported issue, complete approved service, test all
                affected systems, document equipment and provide customer
                walkthrough.
              </p>
            </section>
            <div>
              <span>
                <small>SCHEDULE</small>
                <b>Today · {job.time}</b>
              </span>
              <span>
                <small>TECHNICIAN</small>
                <b>{job.tech}</b>
              </span>
              <span>
                <small>AUTHORIZED</small>
                <b>{job.revenue}</b>
              </span>
              <span>
                <small>PO / TERMS</small>
                <b>NET 15</b>
              </span>
            </div>
            <label>
              <input type="checkbox" /> Scope completed and tested
            </label>
            <label>
              <input type="checkbox" /> Required photos and serials uploaded
            </label>
            <label>
              <input type="checkbox" /> Customer/site sign-off obtained
            </label>
            <button
              onClick={() => onFlash("Work order sent for customer signature")}
            >
              Request customer signature
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function DispatchWorkOrders({
  jobs,
  onFlash,
  onViewJob,
}: {
  jobs: typeof dispatchJobs;
  onFlash: (message: string) => void;
  onViewJob: (index: number) => void;
}) {
  const [status, setStatus] = useState("All");
  return (
    <div className="workOrdersWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>FIELD DOCUMENT CONTROL</span>
          <h1>Every job, documented and billable.</h1>
          <p>
            Scope, labor, photos, notes, approvals, signatures, and invoice
            readiness in one record.
          </p>
        </div>
        <button onClick={() => onFlash("Blank work-order template created")}>
          ＋ Work order
        </button>
      </div>
      <div className="workOrderMetrics">
        {[
          ["OPEN", "12", "7 assigned"],
          ["AWAITING SIGNATURE", "3", "$8.4K value"],
          ["READY TO INVOICE", "6", "$14.7K"],
          ["DOCUMENTATION SCORE", "96%", "+8% this month"],
        ].map((metric) => (
          <article className="dispatchPanel" key={metric[0]}>
            <small>{metric[0]}</small>
            <b>{metric[1]}</b>
            <span>{metric[2]}</span>
          </article>
        ))}
      </div>
      <section className="dispatchPanel workOrderCommandTable">
        <header>
          <div>
            <small>WORK ORDER COMMAND</small>
            <h2>Operational records</h2>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter work orders"
          >
            <option>All</option>
            <option>Open</option>
            <option>Ready to invoice</option>
            <option>Complete</option>
          </select>
        </header>
        <div className="workOrderTableHead">
          <span>WORK ORDER</span>
          <span>DOCUMENTATION</span>
          <span>LABOR</span>
          <span>PAYMENT</span>
          <span>READINESS</span>
        </div>
        {jobs.map((job, index) => {
          const ready = index === 0 || job.status === "COMPLETE";
          return (
            <button onClick={() => onViewJob(index)} key={job.id}>
              <span>
                <b>
                  {job.id} · {job.customer}
                </b>
                <small>
                  {job.service}
                  <br />
                  {job.tech}
                </small>
              </span>
              <span>
                <b>{index === 0 ? "6/6 complete" : "3/6 complete"}</b>
                <small>
                  {index === 0
                    ? "Notes · photos · signature"
                    : "Missing photos or sign-off"}
                </small>
              </span>
              <span>
                <b>{index === 0 ? "1h 34m" : "Scheduled"}</b>
                <small>{index === 0 ? "$420 labor" : job.time}</small>
              </span>
              <span>
                <b>{ready ? "Invoice ready" : "Not billed"}</b>
                <small>{job.revenue}</small>
              </span>
              <em className={ready ? "ready" : "attention"}>
                {ready ? "READY" : "ACTION NEEDED"}
              </em>
            </button>
          );
        })}
      </section>
    </div>
  );
}

function DispatchPayments({ onFlash }: { onFlash: (message: string) => void }) {
  const [quickBooksConnected, setQuickBooksConnected] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<Record<string, string>>({
    "INV-8821": "PAID",
    "INV-8822": "DUE",
    "INV-8823": "DEPOSIT PAID",
    "INV-8824": "DRAFT",
  });
  const invoices = [
    ["INV-8821", "Morrison Residence", "$1,850", "Card · ending 4028", "PAID"],
    ["INV-8822", "Atlas Dental Group", "$2,400", "Net 15 · Aug 28", "DUE"],
    [
      "INV-8823",
      "Carter Collective",
      "$4,200",
      "$1,500 deposit",
      "DEPOSIT PAID",
    ],
    ["INV-8824", "Villa Rosa HOA", "$975", "Awaiting completion", "DRAFT"],
  ];
  const collect = (id: string) => {
    setPaymentStatus((current) => ({ ...current, [id]: "PAYMENT LINK SENT" }));
    onFlash("Secure payment link created and queued");
  };
  return (
    <div className="dispatchPaymentsWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>REVENUE OPERATIONS</span>
          <h1>From completed work to collected cash.</h1>
          <p>
            Deposits, invoices, payment links, reconciliation, disputes, and
            accounting sync.
          </p>
        </div>
        <button onClick={() => onFlash("Invoice composer opened")}>
          ＋ Create invoice
        </button>
      </div>
      <div className="paymentMetrics">
        {[
          ["COLLECTED THIS WEEK", "$36,840", "+18.2%"],
          ["OUTSTANDING", "$11,410", "8 invoices"],
          ["AVG DAYS TO PAY", "4.2", "−1.8 days"],
          ["AUTO-RECONCILED", "94%", "QuickBooks-ready"],
        ].map((metric) => (
          <article className="dispatchPanel" key={metric[0]}>
            <small>{metric[0]}</small>
            <b>{metric[1]}</b>
            <span>{metric[2]}</span>
          </article>
        ))}
      </div>
      <div className="paymentsGrid">
        <section className="dispatchPanel invoiceCommand">
          <header>
            <div>
              <small>INVOICE COMMAND</small>
              <h2>Job payments</h2>
            </div>
            <button onClick={() => onFlash("Payment report exported")}>
              Export
            </button>
          </header>
          {invoices.map((invoice) => (
            <article key={invoice[0]}>
              <span>
                <b>
                  {invoice[0]} · {invoice[1]}
                </b>
                <small>{invoice[3]}</small>
              </span>
              <strong>{invoice[2]}</strong>
              <em>{paymentStatus[invoice[0]] || invoice[4]}</em>
              <button onClick={() => collect(invoice[0])}>
                {paymentStatus[invoice[0]] === "PAID" ? "Receipt" : "Collect"}
              </button>
            </article>
          ))}
        </section>
        <aside className="dispatchPanel quickBooksCard">
          <header>
            <span className={quickBooksConnected ? "connected" : ""}>QB</span>
            <div>
              <small>ACCOUNTING CONNECTION</small>
              <h2>QuickBooks Online</h2>
            </div>
          </header>
          <p>
            Sync customers, invoices, deposits, taxes, service items, contractor
            labor, materials, and payments without double entry.
          </p>
          <ul>
            <li>✓ Job-to-invoice mapping</li>
            <li>✓ Automatic payment reconciliation</li>
            <li>✓ Expense and material categorization</li>
            <li>✓ Failed-sync review queue</li>
          </ul>
          <div>
            <small>CONNECTION STATUS</small>
            <b>
              {quickBooksConnected
                ? "● Connected · last sync 2 min ago"
                : "○ Ready to connect"}
            </b>
          </div>
          <button
            onClick={() => {
              setQuickBooksConnected(true);
              onFlash("QuickBooks connection demo enabled");
            }}
          >
            {quickBooksConnected
              ? "Run QuickBooks sync"
              : "Connect QuickBooks →"}
          </button>
          <small>
            Live OAuth authorization will activate after credentials are
            configured.
          </small>
        </aside>
      </div>
    </div>
  );
}

function DispatchMap({
  jobs,
  onFlash,
  onMove,
}: {
  jobs: typeof dispatchJobs;
  onFlash: (message: string) => void;
  onMove: (index: number, direction: number) => void;
}) {
  return (
    <div className="dispatchMapWorkspace">
      <section className="fullDispatchMap dispatchPanel">
        <header>
          <div>
            <small>REAL-TIME GPS</small>
            <h1>Field visibility</h1>
          </div>
          <div>
            <button onClick={() => onFlash("Map layers opened")}>Layers</button>
            <button onClick={() => onFlash("Map centered on all crews")}>
              Fit all
            </button>
          </div>
        </header>
        <div className="bigMap">
          <i className="mapRoad r1" />
          <i className="mapRoad r2" />
          <i className="mapRoad r3" />
          <i className="mapRoad r4" />
          {[
            ["AC", "21%", "58%", "On site · 42 min"],
            ["MT", "62%", "30%", "Moving · 34 mph"],
            ["DS", "79%", "70%", "En route · 18 min"],
          ].map((t) => (
            <button
              style={{ left: t[1], top: t[2] }}
              onClick={() => onFlash(`${t[0]} live location selected`)}
              key={t[0]}
            >
              <span>{t[0]}</span>
              <b>{t[3]}</b>
            </button>
          ))}
          {jobs.map((job, index) => (
            <i className={`jobPin pin${index + 1}`} key={job.id}>
              {index + 1}
            </i>
          ))}
        </div>
      </section>
      <aside className="routeDrawer dispatchPanel">
        <small>ROUTE COMMAND</small>
        <h2>Andre Cole</h2>
        <p>Thursday · 3 stops · 42.6 miles</p>
        <div className="routeSummary">
          <span>
            <small>DRIVE</small>
            <b>1h 42m</b>
          </span>
          <span>
            <small>SAVED</small>
            <b>31m</b>
          </span>
          <span>
            <small>ON TIME</small>
            <b>98%</b>
          </span>
        </div>
        {jobs.slice(0, 3).map((job, index) => (
          <article key={job.id}>
            <span>{index + 1}</span>
            <div>
              <b>
                {job.time} · {job.customer}
              </b>
              <small>{job.address}</small>
            </div>
            <em>{job.eta}</em>
            <footer>
              <button onClick={() => onMove(index, -1)}>Move up</button>
              <button onClick={() => onMove(index, 1)}>Move down</button>
            </footer>
          </article>
        ))}
        <button
          className="optimizeRoute"
          onClick={() => onFlash("Route optimized with live traffic")}
        >
          ✦ Re-optimize route
        </button>
        <button onClick={() => onFlash("Optimized route sent to Andre")}>
          Send to technician
        </button>
      </aside>
    </div>
  );
}

function DispatchAnalytics({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  return (
    <div className="dispatchAnalytics">
      <div className="dispatchPageHead">
        <div>
          <span>PROFIT + PERFORMANCE</span>
          <h1>Know what every job is worth.</h1>
          <p>
            Revenue, labor, material, source, technician, and lifecycle
            intelligence.
          </p>
        </div>
        <button onClick={() => onFlash("Analytics report exported")}>
          Export report
        </button>
      </div>
      <div className="dispatchMetrics">
        {[
          ["WEEKLY PROFIT", "$18,530", "38.4% margin"],
          ["AVG PROFIT / JOB", "$882", "+$96 WoW"],
          ["REVENUE / HOUR", "$72.40", "+$6.20"],
          ["LEAD SOURCE ROI", "1,640%", "Google Ads"],
        ].map((i, index) => (
          <article key={i[0]}>
            <small>{i[0]}</small>
            <b>{i[1]}</b>
            <span>{i[2]}</span>
          </article>
        ))}
      </div>
      <div className="analyticsDispatchGrid">
        <section className="dispatchPanel revenueChart">
          <header>
            <div>
              <small>REVENUE BY TECHNICIAN</small>
              <h2>Productivity comparison</h2>
            </div>
            <button onClick={() => onFlash("Date range changed")}>
              This month ▾
            </button>
          </header>
          <div>
            {[
              ["Andre", "$24.8K", "88%"],
              ["Maya", "$21.2K", "76%"],
              ["Derek", "$18.9K", "67%"],
              ["Luis", "$15.4K", "55%"],
            ].map((i) => (
              <article key={i[0]}>
                <span>{i[0]}</span>
                <em>
                  <i style={{ width: i[2] }} />
                </em>
                <b>{i[1]}</b>
              </article>
            ))}
          </div>
        </section>
        <section className="dispatchPanel sourceROI">
          <header>
            <div>
              <small>LEAD SOURCE ECONOMICS</small>
              <h2>Spend to lifetime value</h2>
            </div>
          </header>
          {[
            ["Google Ads", "$500", "10", "3", "$8,100", "1,520%"],
            ["Referral", "$0", "8", "6", "$24,000", "∞"],
            ["Facebook", "$680", "14", "4", "$9,600", "1,312%"],
            ["Organic", "$0", "12", "5", "$14,200", "∞"],
          ].map((i) => (
            <div key={i[0]}>
              <b>{i[0]}</b>
              <span>{i[1]} spend</span>
              <span>{i[2]} leads</span>
              <span>{i[3]} booked</span>
              <strong>{i[4]}</strong>
              <em>{i[5]}</em>
            </div>
          ))}
        </section>
        <section className="dispatchPanel marginBreakdown">
          <header>
            <div>
              <small>JOB PROFITABILITY</small>
              <h2>Margin by service type</h2>
            </div>
          </header>
          {[
            ["Access control", "46.2%", "$8.4K"],
            ["Digital signage", "41.8%", "$6.7K"],
            ["Home theater", "38.4%", "$5.2K"],
            ["Camera systems", "34.1%", "$4.8K"],
          ].map((i) => (
            <button
              onClick={() => onFlash(`${i[0]} profitability opened`)}
              key={i[0]}
            >
              <span>
                <b>{i[0]}</b>
                <small>{i[2]} profit</small>
              </span>
              <em>{i[1]}</em>
              <i>
                <span style={{ width: i[1] }} />
              </i>
            </button>
          ))}
        </section>
        <section className="dispatchPanel learningTrend">
          <small>AGENT LEARNING TREND</small>
          <h2>Every conversation makes the system smarter.</h2>
          <div>
            <span>
              <i style={{ height: "42%" }} />
              <small>W1</small>
              <b>72%</b>
            </span>
            <span>
              <i style={{ height: "55%" }} />
              <small>W2</small>
              <b>75%</b>
            </span>
            <span>
              <i style={{ height: "72%" }} />
              <small>W3</small>
              <b>81%</b>
            </span>
            <span>
              <i style={{ height: "83%" }} />
              <small>W4</small>
              <b>84%</b>
            </span>
          </div>
          <button onClick={() => onFlash("Learning insights opened")}>
            Review 3 new learnings →
          </button>
        </section>
        <section className="dispatchPanel fieldEfficiencyPanel">
          <header>
            <div>
              <small>FIELD EFFICIENCY</small>
              <h2>Paid hours vs. operational time</h2>
            </div>
            <span>92.4% verified</span>
          </header>
          {[
            ["Billable labor", "148h", "74%"],
            ["Drive time", "31h", "16%"],
            ["Unallocated time", "12h", "6%"],
            ["Overtime", "8h", "4%"],
          ].map((row) => (
            <article key={row[0]}>
              <span>
                <b>{row[0]}</b>
                <small>{row[1]}</small>
              </span>
              <em>
                <i style={{ width: row[2] }} />
              </em>
              <strong>{row[2]}</strong>
            </article>
          ))}
        </section>
        <section className="dispatchPanel cashVelocityPanel">
          <small>CASH VELOCITY</small>
          <h2>Work completed to money collected.</h2>
          <div>
            <span>
              <b>1.2d</b>
              <small>Complete → invoice</small>
            </span>
            <span>
              <b>4.2d</b>
              <small>Invoice → paid</small>
            </span>
            <span>
              <b>94%</b>
              <small>Auto-reconciled</small>
            </span>
          </div>
          <article>
            <span>Documentation-ready invoices</span>
            <b>96%</b>
          </article>
          <article>
            <span>Deposit coverage</span>
            <b>72%</b>
          </article>
          <article>
            <span>Payment disputes</span>
            <b>0.8%</b>
          </article>
        </section>
      </div>
    </div>
  );
}

function DispatchAgents({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="dispatchAgents">
      <div className="dispatchPageHead">
        <div>
          <span>AI FIELD WORKFORCE</span>
          <h1>Agents that book, recover, notify, and learn.</h1>
          <p>
            Controlled automation with full conversation history and human
            approval.
          </p>
        </div>
        <button onClick={() => onFlash("New field agent created")}>
          ＋ Create agent
        </button>
      </div>
      <div className="dispatchAgentGrid">
        {[
          [
            "Nova",
            "SMS Receptionist",
            "81%",
            "Qualifies inbound leads, books jobs, collects deposits, and assigns the best technician.",
            "1,284 conversations",
          ],
          [
            "Atlas",
            "Setter Agent",
            "18.2%",
            "Recovers dead leads through Day 3, 7, and 14 follow-up sequences.",
            "$15.4K recovered",
          ],
          [
            "Sage",
            "Learning System",
            "+12%",
            "Analyzes which questions, times, and messages produce the best bookings.",
            "3 insights ready",
          ],
          [
            "Kronos",
            "Dispatch Agent",
            "96.8%",
            "Monitors routes, delays, job status, workload, and customer arrival notifications.",
            "438 actions",
          ],
        ].map((agent, index) => (
          <article className="dispatchPanel" key={agent[0]}>
            <header>
              <span>{agent[0][0]}</span>
              <div>
                <small>AGENT {String(index + 1).padStart(2, "0")}</small>
                <h2>{agent[0]}</h2>
              </div>
              <em>● LIVE</em>
            </header>
            <b>{agent[1]}</b>
            <strong>{agent[2]}</strong>
            <p>{agent[3]}</p>
            <div>
              <small>LAST 30 DAYS</small>
              <b>{agent[4]}</b>
            </div>
            <footer>
              <button
                onClick={() => onFlash(`${agent[0]} conversations opened`)}
              >
                Activity
              </button>
              <button onClick={() => onFlash(`${agent[0]} permissions opened`)}>
                Controls
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="agentLearningTable dispatchPanel">
        <header>
          <div>
            <small>LEARNING APPROVAL QUEUE</small>
            <h2>What the agents discovered</h2>
          </div>
          <span>Human approval required</span>
        </header>
        {[
          [
            "Specific times convert 3.1× better",
            "Offer “10 AM tomorrow” before asking an open-ended availability question.",
            "+14% predicted booking rate",
          ],
          [
            "Deposit timing reduces drop-off",
            "Send the deposit link within 45 seconds after appointment confirmation.",
            "−22% abandonment",
          ],
          [
            "Maintenance language wins",
            "“Protect your installation” outperforms “annual service” in warranty reminders.",
            "+18% response rate",
          ],
        ].map((i) => (
          <article key={i[0]}>
            <span>✦</span>
            <div>
              <b>{i[0]}</b>
              <p>{i[1]}</p>
              <small>{i[2]}</small>
            </div>
            <button
              onClick={() => onFlash("Learning approved and prompt updated")}
            >
              Approve
            </button>
            <button onClick={() => onFlash("Learning details opened")}>
              Review
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function DispatchEquipment({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  return (
    <div className="equipmentWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>INSTALLED ASSET REGISTRY</span>
          <h1>Equipment intelligence after the job.</h1>
          <p>
            Every model, serial, installation, warranty, and maintenance
            opportunity.
          </p>
        </div>
        <button onClick={() => onFlash("Equipment registered")}>
          ＋ Register equipment
        </button>
      </div>
      <section className="dispatchPanel equipmentTable">
        <header>
          <span>EQUIPMENT</span>
          <span>CUSTOMER</span>
          <span>INSTALLED</span>
          <span>WARRANTY</span>
          <span>STATUS</span>
        </header>
        {[
          [
            "Sony VPL-XW5000ES",
            "Morrison Residence",
            "Aug 13, 2026",
            "Aug 13, 2029",
            "ACTIVE",
          ],
          [
            "Brivo ACS6000",
            "Carter Collective",
            "Aug 12, 2026",
            "Aug 12, 2028",
            "ACTIVE",
          ],
          [
            'Samsung QMC 75"',
            "Atlas Dental Group",
            "Jul 18, 2026",
            "Jul 18, 2029",
            "ACTIVE",
          ],
          [
            "Luma X20 NVR",
            "Villa Rosa HOA",
            "Sep 21, 2023",
            "Sep 21, 2026",
            "EXPIRING",
          ],
        ].map((i, index) => (
          <button onClick={() => onFlash(`${i[0]} registry opened`)} key={i[0]}>
            <span>
              <i>◇</i>
              <div>
                <b>{i[0]}</b>
                <small>
                  Serial · CY{[842106, 591284, 735902, 418675][index]}
                </small>
              </div>
            </span>
            <strong>{i[1]}</strong>
            <em>{i[2]}</em>
            <em>{i[3]}</em>
            <span className={i[4].toLowerCase()}>{i[4]}</span>
          </button>
        ))}
      </section>
      <div className="equipmentInsights">
        <section className="dispatchPanel">
          <small>WARRANTY AUTOMATION</small>
          <h2>12 upcoming opportunities</h2>
          <p>
            Automatic SMS reminders 30 days before warranty or maintenance
            milestones.
          </p>
          <div>
            <b>35%</b>
            <span>book service</span>
          </div>
          <button onClick={() => onFlash("Warranty campaign opened")}>
            Open reminder system →
          </button>
        </section>
        <section className="dispatchPanel">
          <small>INSTALLED BASE</small>
          <h2>$428K customer equipment</h2>
          <p>186 registered assets across 84 active customer locations.</p>
          <div>
            <b>$82K</b>
            <span>service opportunity</span>
          </div>
          <button onClick={() => onFlash("Installed base analyzed")}>
            Analyze installed base →
          </button>
        </section>
      </div>
    </div>
  );
}

function DispatchTeam({
  onTech,
  onFlash,
}: {
  onTech: () => void;
  onFlash: (message: string) => void;
}) {
  return (
    <div className="teamWorkspace">
      <div className="dispatchPageHead">
        <div>
          <span>PEOPLE + ACCESS</span>
          <h1>One team. Exactly the right access.</h1>
          <p>
            Owners see the business, dispatchers command the field, technicians
            see assigned work only.
          </p>
        </div>
        <button onClick={() => onFlash("Team invitation created")}>
          ＋ Invite teammate
        </button>
      </div>
      <div className="teamRoleCards">
        {[
          [
            "OWNER",
            "Full CRM + Dispatch + Analytics",
            "2 users",
            "All records, revenue, settings, billing",
          ],
          [
            "DISPATCHER",
            "Field command access",
            "3 users",
            "Jobs, crews, GPS, routes, customers",
          ],
          [
            "TECHNICIAN",
            "Assigned work only",
            "7 users",
            "Today’s jobs, work orders, photos, notes",
          ],
        ].map((i) => (
          <article className="dispatchPanel" key={i[0]}>
            <small>{i[0]}</small>
            <h2>{i[1]}</h2>
            <b>{i[2]}</b>
            <p>{i[3]}</p>
            <button
              onClick={() =>
                i[0] === "TECHNICIAN"
                  ? onTech()
                  : onFlash(`${i[0]} access opened`)
              }
            >
              Preview access →
            </button>
          </article>
        ))}
      </div>
      <section className="dispatchPanel teamTable">
        <header>
          <span>TEAM MEMBER</span>
          <span>ROLE</span>
          <span>TODAY</span>
          <span>STATUS</span>
          <span>ACCESS</span>
        </header>
        {[
          ["AC", "Andre Cole", "Technician", "3 jobs · $4.2K", "On job"],
          ["MT", "Maya Torres", "Technician", "3 jobs · $5.8K", "Moving"],
          ["DS", "Derek Stone", "Technician", "2 jobs · $2.9K", "Available"],
          ["DP", "Dana Pierce", "Dispatcher", "12 jobs managed", "Online"],
          ["YL", "Yvette Lomeli", "Owner", "Full command", "Online"],
        ].map((i) => (
          <article className="teamMemberRow" key={i[1]}>
            <span>
              <i>{i[0]}</i>
              <b>{i[1]}</b>
            </span>
            <em>{i[2]}</em>
            <strong>{i[3]}</strong>
            <span>{i[4]}</span>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onFlash(`${i[1]} permissions opened`);
              }}
            >
              Manage
            </button>
          </article>
        ))}
      </section>
    </div>
  );
}

function DispatchSettings({ onFlash }: { onFlash: (message: string) => void }) {
  return (
    <div className="dispatchSettings">
      <div className="dispatchPageHead">
        <div>
          <span>DISPATCH CONFIGURATION</span>
          <h1>Built around your field operation.</h1>
          <p>
            Service rules, territories, notifications, roles, integrations, and
            billing.
          </p>
        </div>
        <button onClick={() => onFlash("Settings saved")}>Save changes</button>
      </div>
      <div className="settingsDispatchGrid">
        {[
          [
            "Company + Billing",
            "CTS Audio Video · Dispatch Professional",
            "$249/mo · Renews Sep 13",
            "Manage subscription",
          ],
          [
            "Service Territory",
            "Palm Beach County · 42-mile radius",
            "6 ZIP rules · 2 priority zones",
            "Edit territory",
          ],
          [
            "Job Lifecycle",
            "BOOKED → ASSIGNED → IN PROGRESS → COMPLETE → INVOICED",
            "5 automation triggers active",
            "Edit lifecycle",
          ],
          [
            "GPS + Geofencing",
            "5-minute active-job pings · 200m arrival radius",
            "Arrival and departure automation on",
            "Configure tracking",
          ],
          [
            "Customer SMS",
            "Booked, en route, arrival, completion, warranty",
            "6 message templates active",
            "Edit messages",
          ],
          [
            "Integrations",
            "Cyncro CRM, Calendar, Stripe, n8n, OSRM",
            "5 systems connected",
            "Manage connections",
          ],
          [
            "Security + Access",
            "Server-enforced Owner, Dispatcher, and Technician policies",
            "RLS active · sessions verified · secrets redacted",
            "Review security",
          ],
          [
            "Reliability",
            "Graceful failures, retries, idempotency, and offline sync",
            "Request tracing · health checks · 50-operation sync batches",
            "Open reliability center",
          ],
          [
            "Abuse Protection",
            "Layered SMS, GPS, job, and IP rate limits",
            "Signed webhooks · duplicate protection · encrypted SMS",
            "View protection rules",
          ],
        ].map((i) => (
          <article className="dispatchPanel" key={i[0]}>
            <small>{i[0].toUpperCase()}</small>
            <h2>{i[1]}</h2>
            <p>{i[2]}</p>
            <button onClick={() => onFlash(`${i[0]} opened`)}>{i[3]} →</button>
          </article>
        ))}
      </div>
    </div>
  );
}

type CRMView =
  | "Overview"
  | "Pipeline"
  | "Accounts"
  | "Contacts"
  | "Conversations"
  | "Social Automations"
  | "Journeys"
  | "Automations"
  | "Data Graph"
  | "Agent Team"
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
    { name: "Accounts", icon: "▦", count: "386" },
    { name: "Contacts", icon: "◎", count: "2.4K" },
    { name: "Conversations", icon: "◇", count: "12" },
    { name: "Social Automations", icon: "⚡", count: "8" },
    { name: "Journeys", icon: "↝", count: "6" },
    { name: "Automations", icon: "⌁", count: "18" },
    { name: "Data Graph", icon: "⌘" },
    { name: "Agent Team", icon: "✧", count: "5" },
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
          <small>CYNCRO CRM · REVENUE OS</small>
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
              <label>CYNCRO CRM</label>
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
          {view === "Accounts" && <CRMAccounts onFlash={flash} />}
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
          {view === "Social Automations" && (
            <CRMSocialAutomations onFlash={flash} />
          )}
          {view === "Journeys" && <CRMJourneys onFlash={flash} />}
          {view === "Automations" && <CRMAutomations onFlash={flash} />}
          {view === "Data Graph" && <CRMDataGraph onFlash={flash} />}
          {view === "Agent Team" && <CRMAgentTeam onFlash={flash} />}
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

function CRMSocialAutomations({
  onFlash,
}: {
  onFlash: (message: string) => void;
}) {
  const [panel, setPanel] = useState("Flow Builder");
  const [selectedFlow, setSelectedFlow] = useState(0);
  const [instagramConnected, setInstagramConnected] = useState(true);
  const [facebookConnected, setFacebookConnected] = useState(true);
  const [published, setPublished] = useState(true);
  const [reply, setReply] = useState(
    "You’re in ✦ I can help you choose the right Cyncro system. What would you like to accomplish?",
  );
  const [customKeyword, setCustomKeyword] = useState("");
  const [extraKeywords, setExtraKeywords] = useState<string[]>([]);
  const flows = [
    {
      name: "DEMO keyword",
      channel: "Instagram + Facebook",
      trigger: "DEMO",
      reach: "1,284",
      leads: "386",
      rate: "30.1%",
      status: "LIVE",
    },
    {
      name: "Comment-to-DM launch",
      channel: "Instagram comments",
      trigger: "SYSTEM",
      reach: "842",
      leads: "214",
      rate: "25.4%",
      status: "LIVE",
    },
    {
      name: "Pricing concierge",
      channel: "Facebook Messenger",
      trigger: "PRICE",
      reach: "419",
      leads: "172",
      rate: "41.1%",
      status: "LIVE",
    },
    {
      name: "Event waitlist",
      channel: "Instagram story replies",
      trigger: "WAITLIST",
      reach: "268",
      leads: "96",
      rate: "35.8%",
      status: "DRAFT",
    },
  ];
  const active = flows[selectedFlow];
  const addKeyword = () => {
    const clean = customKeyword.trim().toUpperCase();
    if (!clean || extraKeywords.includes(clean)) return;
    setExtraKeywords([...extraKeywords, clean]);
    setCustomKeyword("");
    onFlash(`${clean} trigger added`);
  };
  return (
    <div className="socialAutomationWorkspace">
      <section className="socialHero">
        <div>
          <small>SOCIAL REVENUE ENGINE</small>
          <h2>Turn every comment and DM into a customer journey.</h2>
          <p>
            Connect Instagram and Facebook, listen for buying words, respond
            instantly, capture the lead, and move them into Cyncro CRM.
          </p>
          <div className="socialHeroActions">
            <button onClick={() => onFlash("New social flow created")}>
              ＋ Create automation
            </button>
            <button onClick={() => setPanel("Live Inbox")}>
              Open live inbox →
            </button>
          </div>
        </div>
        <div className="socialPulse">
          <span>LIVE CONVERSION PULSE</span>
          <b>386</b>
          <small>LEADS CAPTURED THIS MONTH</small>
          <div>
            <i style={{ width: "72%" }} />
          </div>
          <em>↑ 28.6% from social automation</em>
        </div>
      </section>

      <div className="socialStats">
        {[
          ["2,813", "AUTOMATED CONVERSATIONS", "+18.4%"],
          ["34.6%", "LEAD CAPTURE RATE", "+6.2%"],
          ["18 sec", "AVERAGE FIRST RESPONSE", "Always on"],
          ["$42.8K", "SOCIAL-ATTRIBUTED PIPELINE", "+$9.4K"],
        ].map((stat) => (
          <article key={stat[1]}>
            <small>{stat[1]}</small>
            <b>{stat[0]}</b>
            <span>{stat[2]}</span>
          </article>
        ))}
      </div>

      <section className="channelConnections crmPanel">
        <div className="crmPanelHead">
          <div>
            <small>CONNECTED CHANNELS</small>
            <h2>Your social front desk</h2>
          </div>
          <button onClick={() => onFlash("Channel settings opened")}>
            Manage permissions
          </button>
        </div>
        <div className="channelGrid">
          <article className={instagramConnected ? "connected" : ""}>
            <span className="instagramGlyph">◎</span>
            <div>
              <b>Instagram Business</b>
              <small>@cyncromedia · DMs, comments, stories, mentions</small>
            </div>
            <em>{instagramConnected ? "● CONNECTED" : "NOT CONNECTED"}</em>
            <button
              onClick={() => {
                setInstagramConnected(!instagramConnected);
                onFlash(
                  instagramConnected
                    ? "Instagram disconnected"
                    : "Instagram connected",
                );
              }}
            >
              {instagramConnected ? "Settings" : "Connect"}
            </button>
          </article>
          <article className={facebookConnected ? "connected" : ""}>
            <span className="facebookGlyph">f</span>
            <div>
              <b>Facebook Page</b>
              <small>Cyncro Media · Messenger, comments, ads</small>
            </div>
            <em>{facebookConnected ? "● CONNECTED" : "NOT CONNECTED"}</em>
            <button
              onClick={() => {
                setFacebookConnected(!facebookConnected);
                onFlash(
                  facebookConnected
                    ? "Facebook disconnected"
                    : "Facebook connected",
                );
              }}
            >
              {facebookConnected ? "Settings" : "Connect"}
            </button>
          </article>
          <button
            className="channelAdd"
            onClick={() => onFlash("WhatsApp connection ready")}
          >
            <span>＋</span>
            <b>Add WhatsApp</b>
            <small>Bring every conversation into one inbox</small>
          </button>
        </div>
      </section>

      <nav className="socialTabs" aria-label="Social automation workspace">
        {["Flow Builder", "Live Inbox", "Audience", "Analytics"].map((item) => (
          <button
            className={panel === item ? "active" : ""}
            onClick={() => setPanel(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>

      {panel === "Flow Builder" && (
        <div className="socialBuilder">
          <aside className="flowLibrary crmPanel">
            <header>
              <div>
                <small>KEYWORD AUTOMATIONS</small>
                <h2>Live flows</h2>
              </div>
              <button onClick={() => onFlash("Blank flow created")}>＋</button>
            </header>
            {flows.map((flow, index) => (
              <button
                className={selectedFlow === index ? "active" : ""}
                onClick={() => {
                  setSelectedFlow(index);
                  setPublished(flow.status === "LIVE");
                }}
                key={flow.name}
              >
                <i>{flow.trigger.slice(0, 2)}</i>
                <span>
                  <b>{flow.name}</b>
                  <small>{flow.channel}</small>
                </span>
                <em className={flow.status.toLowerCase()}>{flow.status}</em>
              </button>
            ))}
            <button
              className="flowTemplate"
              onClick={() => onFlash("Template library opened")}
            >
              ✦ Browse conversion templates
            </button>
          </aside>

          <main className="flowCanvas crmPanel">
            <header>
              <div>
                <small>EDITING AUTOMATION</small>
                <h2>{active.name}</h2>
                <span>Last edited 2 minutes ago · Autosaved</span>
              </div>
              <div>
                <span
                  className={published ? "publishState live" : "publishState"}
                >
                  ● {published ? "LIVE" : "DRAFT"}
                </span>
                <button onClick={() => onFlash("Flow tested successfully")}>
                  Test flow
                </button>
                <button
                  className="publishFlow"
                  onClick={() => {
                    setPublished(!published);
                    onFlash(published ? "Flow paused" : "Flow published");
                  }}
                >
                  {published ? "Pause" : "Publish"}
                </button>
              </div>
            </header>
            <div className="flowDesignArea">
              <div className="flowSequence">
                <article className="flowStep triggerStep">
                  <div className="flowStepHead">
                    <span>⚡</span>
                    <div>
                      <small>TRIGGER</small>
                      <b>Customer says a keyword</b>
                    </div>
                    <em>01</em>
                  </div>
                  <p>
                    Listen in DMs, comments, story replies, and ad responses.
                  </p>
                  <div className="keywordEditor">
                    {[active.trigger, "INFO", ...extraKeywords].map((word) => (
                      <button
                        onClick={() => onFlash(`${word} keyword selected`)}
                        key={word}
                      >
                        {word} ×
                      </button>
                    ))}
                    <input
                      value={customKeyword}
                      onChange={(event) => setCustomKeyword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addKeyword();
                      }}
                      placeholder="Add word…"
                    />
                    <button className="addKeyword" onClick={addKeyword}>
                      ＋
                    </button>
                  </div>
                  <label>
                    <input type="checkbox" defaultChecked /> Match close phrases
                    and misspellings with AI
                  </label>
                </article>
                <div className="flowLine">
                  <span>immediately</span>
                </div>
                <article className="flowStep messageStep">
                  <div className="flowStepHead">
                    <span>✦</span>
                    <div>
                      <small>SMART REPLY</small>
                      <b>Send an instant response</b>
                    </div>
                    <em>02</em>
                  </div>
                  <textarea
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    aria-label="Automatic social reply"
                  />
                  <div className="quickReplies">
                    {["Book a demo", "See pricing", "Ask a question"].map(
                      (item) => (
                        <button
                          onClick={() => onFlash(`${item} reply edited`)}
                          key={item}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button onClick={() => onFlash("Quick reply added")}>
                      ＋
                    </button>
                  </div>
                </article>
                <div className="flowLine">
                  <span>after response</span>
                </div>
                <div className="flowBranch">
                  <article className="flowStep captureStep">
                    <div className="flowStepHead">
                      <span>◎</span>
                      <div>
                        <small>CAPTURE + ENRICH</small>
                        <b>Create CRM contact</b>
                      </div>
                    </div>
                    <p>
                      Name, email, phone, social profile, source, consent, and
                      intent.
                    </p>
                    <button onClick={() => onFlash("Contact mapping opened")}>
                      Edit field mapping →
                    </button>
                  </article>
                  <article className="flowStep actionStep">
                    <div className="flowStepHead">
                      <span>↗</span>
                      <div>
                        <small>CONVERSION ACTION</small>
                        <b>Route the next move</b>
                      </div>
                    </div>
                    <p>
                      Send booking link, payment request, offer, or human
                      handoff.
                    </p>
                    <button onClick={() => onFlash("Conversion action opened")}>
                      Book a strategy call ▾
                    </button>
                  </article>
                </div>
                <button
                  className="addFlowStep"
                  onClick={() => onFlash("Flow step library opened")}
                >
                  ＋ Add condition, message, delay, action, or AI decision
                </button>
              </div>
              <aside className="dmPreview">
                <header>
                  <span>◎</span>
                  <div>
                    <b>@cyncromedia</b>
                    <small>Typically replies instantly</small>
                  </div>
                  <i>•••</i>
                </header>
                <div className="dmMessages">
                  <time>TODAY · 2:14 PM</time>
                  <p className="incoming">{active.trigger}</p>
                  <p className="outgoing">{reply}</p>
                  <div className="previewReplies">
                    <button>Book a demo</button>
                    <button>See pricing</button>
                    <button>Ask a question</button>
                  </div>
                </div>
                <footer>
                  <span>＋</span>
                  <input placeholder="Message…" />
                  <span>♡</span>
                </footer>
              </aside>
            </div>
          </main>
        </div>
      )}

      {panel === "Live Inbox" && (
        <div className="socialInbox crmPanel">
          <aside>
            <div className="socialInboxHead">
              <div>
                <small>UNIFIED SOCIAL INBOX</small>
                <h2>Needs attention</h2>
              </div>
              <span>12 open</span>
            </div>
            {[
              [
                "SL",
                "Sophia Lewis",
                "IG",
                "I want the demo—can I see pricing?",
                "Now",
              ],
              ["MR", "Marcus Reed", "FB", "SYSTEM", "3m"],
              ["NC", "Nia Carter", "IG", "Can someone help me choose?", "9m"],
              ["DK", "Daniel Kim", "FB", "Sent a payment screenshot", "18m"],
            ].map((item, index) => (
              <button className={index === 0 ? "active" : ""} key={item[1]}>
                <i>{item[0]}</i>
                <span>
                  <b>{item[1]}</b>
                  <small>{item[3]}</small>
                </span>
                <em>
                  {item[2]} · {item[4]}
                </em>
              </button>
            ))}
          </aside>
          <article>
            <header>
              <div>
                <b>Sophia Lewis</b>
                <small>Instagram · High buying intent · Contact matched</small>
              </div>
              <button onClick={() => onFlash("Conversation assigned")}>
                Assign ▾
              </button>
            </header>
            <div className="inboxConversation">
              <p className="incoming">DEMO</p>
              <p className="outgoing">
                You’re in ✦ What would you like to accomplish?
              </p>
              <p className="incoming">I want the demo—can I see pricing?</p>
              <div className="aiSocialAssist">
                <span>✦</span>
                <p>
                  <b>Suggested reply</b>Absolutely. I can show you the platform
                  and recommend the best setup based on your goals. Want the
                  private booking link?
                </p>
                <button onClick={() => onFlash("AI reply inserted")}>
                  Use reply
                </button>
              </div>
            </div>
            <footer>
              <button>＋</button>
              <input placeholder="Reply as Cyncro Media…" />
              <button onClick={() => onFlash("Social reply sent")}>
                Send ↑
              </button>
            </footer>
          </article>
          <aside className="socialContactPanel">
            <small>CONTACT INTELLIGENCE</small>
            <span>SL</span>
            <h3>Sophia Lewis</h3>
            <p>@sophialewis · Palm Beach, FL</p>
            <div>
              <small>INTENT SCORE</small>
              <b>92</b>
            </div>
            <div>
              <small>TRIGGER</small>
              <b>DEMO</b>
            </div>
            <div>
              <small>ATTRIBUTION</small>
              <b>Instagram Reel</b>
            </div>
            <button onClick={() => onFlash("CRM record opened")}>
              Open CRM record →
            </button>
          </aside>
        </div>
      )}

      {panel === "Audience" && (
        <div className="socialAudience">
          <section className="crmPanel">
            <div className="crmPanelHead">
              <div>
                <small>SMART AUDIENCES</small>
                <h2>Segments that update themselves</h2>
              </div>
              <button onClick={() => onFlash("Segment builder opened")}>
                ＋ New segment
              </button>
            </div>
            {[
              [
                "High-intent social leads",
                "386 people",
                "Intent above 80 + replied in 14 days",
                "+42",
              ],
              [
                "Pricing requested",
                "172 people",
                "Said PRICE, COST, or PAYMENT",
                "+18",
              ],
              [
                "Booked from Instagram",
                "96 people",
                "Social attribution + confirmed booking",
                "+11",
              ],
              [
                "Needs human follow-up",
                "28 people",
                "AI confidence below threshold",
                "−6",
              ],
            ].map((item) => (
              <button
                className="audienceRow"
                onClick={() => onFlash(`${item[0]} opened`)}
                key={item[0]}
              >
                <span>
                  <b>{item[0]}</b>
                  <small>{item[2]}</small>
                </span>
                <strong>{item[1]}</strong>
                <em>{item[3]} this week</em>
                <i>→</i>
              </button>
            ))}
          </section>
          <aside className="crmPanel">
            <small>AUDIENCE INTELLIGENCE</small>
            <h2>2,418</h2>
            <p>Known social profiles unified with Cyncro contacts.</p>
            <div className="audienceRing">
              <span>
                <b>68%</b>
                <small>reachable</small>
              </span>
            </div>
            <button onClick={() => onFlash("Audience opportunity analyzed")}>
              ✦ Find revenue opportunity
            </button>
          </aside>
        </div>
      )}

      {panel === "Analytics" && (
        <div className="socialAnalytics">
          <section className="crmPanel">
            <div className="crmPanelHead">
              <div>
                <small>CONVERSION ANALYTICS</small>
                <h2>From keyword to revenue</h2>
              </div>
              <button onClick={() => onFlash("Analytics exported")}>
                Export report
              </button>
            </div>
            <div className="socialFunnel">
              {[
                ["REACHED", "8,142", "100%"],
                ["ENGAGED", "2,813", "34.5%"],
                ["CAPTURED", "973", "11.9%"],
                ["BOOKED", "286", "3.5%"],
                ["WON", "$42.8K", "1.2%"],
              ].map((item, index) => (
                <article
                  style={{ width: `${100 - index * 11}%` }}
                  key={item[0]}
                >
                  <small>{item[0]}</small>
                  <b>{item[1]}</b>
                  <span>{item[2]}</span>
                </article>
              ))}
            </div>
          </section>
          <aside className="crmPanel">
            <small>TOP BUYING WORDS</small>
            <h2>Intent leaderboard</h2>
            {[
              ["DEMO", "386 leads"],
              ["PRICE", "172 leads"],
              ["SYSTEM", "128 leads"],
              ["BOOK", "96 leads"],
              ["HELP", "74 leads"],
            ].map((item, index) => (
              <div key={item[0]}>
                <span>{index + 1}</span>
                <b>{item[0]}</b>
                <em>{item[1]}</em>
              </div>
            ))}
            <button onClick={() => onFlash("AI keywords discovered")}>
              ✦ Discover hidden keywords
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}

function CRMAccounts({ onFlash }: { onFlash: (message: string) => void }) {
  const [account, setAccount] = useState(0);
  const accounts = [
    [
      "Axis Systems",
      "$32,000",
      "Expansion",
      "92",
      "Strong",
      "Daniel Kim",
      "3 stakeholders",
    ],
    [
      "Northstar Advisory",
      "$18,500",
      "Proposal",
      "88",
      "Strong",
      "Alexandra Lewis",
      "2 stakeholders",
    ],
    [
      "Reed Development",
      "$12,000",
      "Qualified",
      "81",
      "Growing",
      "Marcus Reed",
      "4 stakeholders",
    ],
    [
      "Atelier House",
      "$7,500",
      "Discovery",
      "67",
      "Watch",
      "Sophia Bennett",
      "2 stakeholders",
    ],
  ];
  const active = accounts[account];
  return (
    <div className="accountWorkspace">
      <section className="accountPortfolio crmPanel">
        <div className="crmPanelHead">
          <div>
            <small>ACCOUNT PORTFOLIO</small>
            <h2>Revenue relationships</h2>
          </div>
          <button onClick={() => onFlash("Portfolio filters opened")}>
            Segment accounts
          </button>
        </div>
        <div className="accountPortfolioHead">
          <span>ACCOUNT</span>
          <span>VALUE</span>
          <span>STAGE</span>
          <span>HEALTH</span>
        </div>
        {accounts.map((item, index) => (
          <button
            className={account === index ? "active" : ""}
            onClick={() => setAccount(index)}
            key={item[0]}
          >
            <span>
              <i>{item[0].slice(0, 2).toUpperCase()}</i>
              <div>
                <b>{item[0]}</b>
                <small>{item[5]}</small>
              </div>
            </span>
            <strong>{item[1]}</strong>
            <em>{item[2]}</em>
            <span className={`accountHealth ${item[4].toLowerCase()}`}>
              {item[3]} · {item[4]}
            </span>
          </button>
        ))}
      </section>
      <section className="accountCommand crmPanel">
        <div className="accountCommandHead">
          <div>
            <small>ACCOUNT COMMAND</small>
            <h2>{active[0]}</h2>
            <p>
              Unified relationship, revenue, engagement, and delivery
              intelligence.
            </p>
          </div>
          <span>{active[3]} health</span>
        </div>
        <div className="accountValueGrid">
          {[
            ["OPEN VALUE", active[1]],
            ["LIFETIME VALUE", "$84,500"],
            ["ENGAGEMENT", "High"],
            ["NEXT RENEWAL", "Oct 18"],
          ].map((item) => (
            <div key={item[0]}>
              <small>{item[0]}</small>
              <b>{item[1]}</b>
            </div>
          ))}
        </div>
        <div className="buyingCommittee">
          <div className="crmPanelHead">
            <div>
              <small>RELATIONSHIP MAP</small>
              <h3>Buying committee</h3>
            </div>
            <button onClick={() => onFlash("Stakeholder added")}>
              ＋ Stakeholder
            </button>
          </div>
          {[
            [active[5], "Decision maker", "Champion", "94"],
            ["Mia Thompson", "Finance lead", "Supportive", "79"],
            ["Jordan Ellis", "Operations", "Evaluator", "72"],
          ].map((person) => (
            <div key={person[0]}>
              <i>
                {person[0]
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </i>
              <span>
                <b>{person[0]}</b>
                <small>
                  {person[1]} · {person[2]}
                </small>
              </span>
              <em>{person[3]} influence</em>
            </div>
          ))}
        </div>
        <div className="accountSignals">
          <small>PREDICTIVE SIGNALS</small>
          {[
            [
              "Payment activity",
              "Proposal and payment link opened twice today",
              "+18",
            ],
            ["Stakeholder coverage", active[6] + " identified", "+12"],
            [
              "Engagement risk",
              "No response from finance lead in 6 days",
              "−7",
            ],
          ].map((signal) => (
            <button onClick={() => onFlash("Signal explained")} key={signal[0]}>
              <span>
                <b>{signal[0]}</b>
                <small>{signal[1]}</small>
              </span>
              <em>{signal[2]}</em>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function CRMJourneys({ onFlash }: { onFlash: (message: string) => void }) {
  const [journey, setJourney] = useState("Client acquisition");
  const journeys = [
    "Client acquisition",
    "Paid event",
    "Customer onboarding",
    "Renewal & expansion",
  ];
  return (
    <div className="journeyWorkspace">
      <aside className="journeyLibrary crmPanel">
        <div>
          <small>JOURNEY ORCHESTRATOR</small>
          <h2>Lifecycle systems</h2>
          <p>Coordinate every customer moment across teams and channels.</p>
        </div>
        {journeys.map((item, index) => (
          <button
            className={journey === item ? "active" : ""}
            onClick={() => setJourney(item)}
            key={item}
          >
            <i>{String(index + 1).padStart(2, "0")}</i>
            <span>
              <b>{item}</b>
              <small>
                {index === 0
                  ? "842 active contacts"
                  : `${(index + 2) * 61} active contacts`}
              </small>
            </span>
            <em>→</em>
          </button>
        ))}
        <button
          className="newJourney"
          onClick={() => onFlash("Journey builder opened")}
        >
          ＋ Create journey
        </button>
      </aside>
      <main className="journeyBuilder crmPanel">
        <header>
          <div>
            <small>LIVE JOURNEY</small>
            <h2>{journey}</h2>
          </div>
          <div>
            <span>● 842 enrolled</span>
            <button onClick={() => onFlash("Journey published")}>
              Publish changes
            </button>
          </div>
        </header>
        <div className="journeyFlowCanvas">
          <div className="journeyLane">
            <small>ENTRY</small>
            <article>
              <i>⚡</i>
              <div>
                <b>Customer signal</b>
                <span>
                  Qualified booking, form, payment, or manual enrollment
                </span>
              </div>
              <em>842</em>
            </article>
          </div>
          <div className="journeyConnector">
            <span>Conditions passed · 78%</span>
          </div>
          <div className="journeyLane">
            <small>INTELLIGENCE</small>
            <div className="journeyBranch">
              <article>
                <i>✦</i>
                <div>
                  <b>Evaluate fit + intent</b>
                  <span>
                    Score profile, behavior, source, value, and timing
                  </span>
                </div>
                <em>AI</em>
              </article>
              <article>
                <i>⌁</i>
                <div>
                  <b>Route ownership</b>
                  <span>
                    Match territory, service, workload, and relationship
                  </span>
                </div>
                <em>3 rules</em>
              </article>
            </div>
          </div>
          <div className="journeyConnector">
            <span>High intent → personal path</span>
          </div>
          <div className="journeyLane">
            <small>ORCHESTRATION</small>
            <div className="journeyBranch three">
              <article>
                <i>✉</i>
                <div>
                  <b>Personalized follow-up</b>
                  <span>Email + SMS</span>
                </div>
                <em>2 min</em>
              </article>
              <article>
                <i>□</i>
                <div>
                  <b>Create next action</b>
                  <span>Task + booking link</span>
                </div>
                <em>Owner</em>
              </article>
              <article>
                <i>$</i>
                <div>
                  <b>Revenue path</b>
                  <span>Offer + payment</span>
                </div>
                <em>Dynamic</em>
              </article>
            </div>
          </div>
          <div className="journeyConnector">
            <span>Wait until outcome or signal</span>
          </div>
          <div className="journeyLane">
            <small>OUTCOME</small>
            <article className="journeyOutcome">
              <i>✓</i>
              <div>
                <b>Lifecycle advanced</b>
                <span>
                  Contact, account, opportunity, forecast, and analytics
                  synchronized
                </span>
              </div>
              <em>31.8%</em>
            </article>
          </div>
          <button
            className="journeyAdd"
            onClick={() => onFlash("Journey step added")}
          >
            ＋ Add decision, action, delay, experiment, or AI agent
          </button>
        </div>
      </main>
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
function CRMDataGraph({ onFlash }: { onFlash: (message: string) => void }) {
  const [focus, setFocus] = useState("Alexandra Lewis");
  const nodes = [
    ["Alexandra Lewis", "CONTACT", "graphContact", "50%", "44%"],
    ["Northstar Advisory", "ACCOUNT", "graphAccount", "50%", "12%"],
    ["$18.5K Proposal", "OPPORTUNITY", "graphDeal", "19%", "38%"],
    ["Strategy Session", "BOOKING", "graphBooking", "81%", "38%"],
    ["Yvette Lomeli", "OWNER", "graphOwner", "27%", "73%"],
    ["Private Link", "SOURCE", "graphSource", "73%", "73%"],
    ["Payment Intent", "SIGNAL", "graphSignal", "50%", "83%"],
  ];
  return (
    <div className="graphWorkspace">
      <section className="graphCanvas crmPanel">
        <header>
          <div>
            <small>UNIVERSAL RELATIONSHIP GRAPH</small>
            <h2>Every record. Every relationship. One truth.</h2>
          </div>
          <div>
            <button onClick={() => onFlash("Graph filter opened")}>
              Filter objects
            </button>
            <button onClick={() => onFlash("Graph expanded")}>
              Expand network
            </button>
          </div>
        </header>
        <div className="graphStage">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line x1="50" y1="44" x2="50" y2="12" />
            <line x1="50" y1="44" x2="19" y2="38" />
            <line x1="50" y1="44" x2="81" y2="38" />
            <line x1="50" y1="44" x2="27" y2="73" />
            <line x1="50" y1="44" x2="73" y2="73" />
            <line x1="50" y1="44" x2="50" y2="83" />
            <line x1="19" y1="38" x2="27" y2="73" />
            <line x1="81" y1="38" x2="73" y2="73" />
          </svg>
          {nodes.map((node) => (
            <button
              className={`graphNode ${node[2]} ${focus === node[0] ? "active" : ""}`}
              style={{ left: node[3], top: node[4] }}
              onClick={() => setFocus(node[0])}
              key={node[0]}
            >
              <small>{node[1]}</small>
              <b>{node[0]}</b>
              <i>●</i>
            </button>
          ))}
        </div>
        <footer>
          <span>
            <i className="graphContact" /> Contact
          </span>
          <span>
            <i className="graphAccount" /> Account
          </span>
          <span>
            <i className="graphDeal" /> Revenue
          </span>
          <span>
            <i className="graphBooking" /> Booking
          </span>
          <span>
            <i className="graphSignal" /> Signal
          </span>
        </footer>
      </section>
      <aside className="graphInspector crmPanel">
        <small>GRAPH INSPECTOR</small>
        <h2>{focus}</h2>
        <p>Live context assembled across the complete Cyncro object model.</p>
        <div className="graphScore">
          <span>
            <b>94</b>
            <small>INTENT</small>
          </span>
          <span>
            <b>88</b>
            <small>HEALTH</small>
          </span>
          <span>
            <b>76</b>
            <small>FIT</small>
          </span>
        </div>
        {[
          ["Connected records", "18"],
          ["Relationship depth", "4 levels"],
          ["Last signal", "4 min ago"],
          ["Data confidence", "98.7%"],
        ].map((item) => (
          <div className="graphFact" key={item[0]}>
            <span>{item[0]}</span>
            <b>{item[1]}</b>
          </div>
        ))}
        <h3>Ask the graph</h3>
        {[
          "Who influences this deal?",
          "What changed this week?",
          "Show the shortest path to revenue",
        ].map((item) => (
          <button onClick={() => onFlash("Graph answer generated")} key={item}>
            ✦ {item}
          </button>
        ))}
      </aside>
    </div>
  );
}

function CRMAgentTeam({ onFlash }: { onFlash: (message: string) => void }) {
  const agents = [
    [
      "Atlas",
      "Revenue strategist",
      "Prioritizes pipeline, forecasts outcomes, and builds next-best actions.",
      "128 decisions",
      "LIVE",
    ],
    [
      "Nova",
      "Conversation agent",
      "Handles inbound qualification and maintains context across every channel.",
      "84 conversations",
      "LIVE",
    ],
    [
      "Sage",
      "Customer intelligence",
      "Enriches records, maps relationships, and monitors health and intent.",
      "2,418 records",
      "LIVE",
    ],
    [
      "Kronos",
      "Operations agent",
      "Coordinates tasks, bookings, owners, resources, deadlines, and SLAs.",
      "396 actions",
      "LIVE",
    ],
    [
      "Onyx",
      "Governance agent",
      "Monitors permissions, data quality, duplicates, risk, and audit policy.",
      "14 reviews",
      "GUARDED",
    ],
  ];
  return (
    <div className="agentWorkspace">
      <section className="agentHero">
        <div>
          <small>AGENTIC REVENUE OPERATING SYSTEM</small>
          <h2>Your AI team works across the entire customer lifecycle.</h2>
          <p>
            Each agent has a defined role, access boundary, approval policy,
            memory scope, and measurable business outcome.
          </p>
        </div>
        <aside>
          <span>5 agents online</span>
          <b>99.98%</b>
          <small>CONTROLLED EXECUTION RATE</small>
          <button onClick={() => onFlash("Agent orchestration opened")}>
            Open orchestration map →
          </button>
        </aside>
      </section>
      <div className="agentGrid">
        {agents.map((agent, index) => (
          <article className="crmPanel" key={agent[0]}>
            <header>
              <span>{agent[0][0]}</span>
              <div>
                <small>AGENT {String(index + 1).padStart(2, "0")}</small>
                <h3>{agent[0]}</h3>
              </div>
              <i className={agent[4] === "LIVE" ? "live" : "guarded"}>
                {agent[4]}
              </i>
            </header>
            <b>{agent[1]}</b>
            <p>{agent[2]}</p>
            <div className="agentStats">
              <span>
                <small>LAST 30 DAYS</small>
                <b>{agent[3]}</b>
              </span>
              <span>
                <small>AUTHORITY</small>
                <b>
                  {index < 2
                    ? "Approve to send"
                    : index === 4
                      ? "Audit only"
                      : "Internal actions"}
                </b>
              </span>
            </div>
            <footer>
              <button onClick={() => onFlash(`${agent[0]} activity opened`)}>
                View activity
              </button>
              <button onClick={() => onFlash(`${agent[0]} controls opened`)}>
                Permissions
              </button>
            </footer>
          </article>
        ))}
      </div>
      <section className="agentCommand crmPanel">
        <div>
          <small>SHARED MISSION CONTROL</small>
          <h2>Coordinate agents around an outcome—not disconnected tasks.</h2>
        </div>
        <div className="missionFlow">
          <article>
            <span>01</span>
            <b>Observe</b>
            <small>Business event stream</small>
          </article>
          <i>→</i>
          <article>
            <span>02</span>
            <b>Reason</b>
            <small>Shared context + policy</small>
          </article>
          <i>→</i>
          <article>
            <span>03</span>
            <b>Propose</b>
            <small>Plan + predicted impact</small>
          </article>
          <i>→</i>
          <article>
            <span>04</span>
            <b>Approve</b>
            <small>Human or policy gate</small>
          </article>
          <i>→</i>
          <article>
            <span>05</span>
            <b>Execute</b>
            <small>Action + full audit</small>
          </article>
        </div>
        <button onClick={() => onFlash("Mission builder opened")}>
          ＋ Build an agent mission
        </button>
      </section>
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
