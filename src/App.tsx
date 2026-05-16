import { useState, useRef, useEffect } from 'react'
import { createClient, type User } from "@supabase/supabase-js";
import { type RecordData, type Record, type ErrorDisplay } from "./core/Types";
import "./App.css";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

const ERROR_DISPLAY_DURATION = 5000;

function App() {
  const [loaded, setLoaded] = useState<boolean>(false);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [addingCategory, setAddingCategory] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<RecordData | null>(null);
  const [addingContent, setAddingContent] = useState<boolean>(false);
  const [addingDate, setAddingDate] = useState<boolean>(false);
  const [errors, setErrors] = useState<ErrorDisplay[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const categoryNameRef = useRef<HTMLInputElement>(null);
  const contentNameRef = useRef<HTMLInputElement>(null);
  const contentDateRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLSelectElement>(null);

  function causeError(message: string) {
    setErrors(prev => [...prev, {
      message,
      createdAt: new Date()
    }]);
    setTimeout(() => {
      setErrors(prev => prev.filter(error => new Date().getTime() - error.createdAt.getTime() < ERROR_DISPLAY_DURATION));
    }, ERROR_DISPLAY_DURATION + 100);
  }

  async function getRecords() {
    const { data, error } = await supabase.from("records").select();

    if (error) {
      console.log("Error fetching records:", error);
      causeError("Failed to fetch records: " + (error instanceof Error ? error.message : String(error)));
      return;
    }

    try {
      setRecords(data as RecordData[]);
    } catch (error) {
      console.log("Error setting records:", error);
      causeError("Failed to set records: " + (error instanceof Error ? error.message : String(error)));
    }

    console.log("Fetched records:", data);
    setLoaded(true);
  }

  async function addCategory(name: string) {
    const record: RecordData = {
      category: name,
      content: []
    }
    const newRecord = [...records, record];

    const { error } = await supabase.from("records").insert(record);

    if (error) {
      causeError("Failed to add category: " + (error.message || String(error)));
      console.log("Error adding record:", error);
      return;
    }

    setRecords(newRecord);
  }

  async function addContent(category: string, content: string, date: Date) {
    const newContent: Record = {
      content,
      date: [`${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`]
    }
    const rec = {
      content: [...(selectedCategory?.content || []), newContent]
        .sort((a, b) => a.content.localeCompare(b.content))
    }
    const newRecords = records.map(record => {
      if (record.category === category) {
        return {
          ...record,
          content: rec.content
        }
      }
      return record;
    });

    const { error } = await supabase.from("records").update(rec).eq("category", category);

    if (error) {
      causeError("Failed to add content: " + (error instanceof Error ? error.message : String(error)));
      console.log("Error adding content:", error);
      return;
    }

    setSelectedCategory({
      category,
      content: rec.content
    });
    setRecords(newRecords);
  }

  async function addDate(category: string, content: string, date: Date) {
    const rec = selectedCategory?.content.map(c => {
      if (c.content === content) {
        return {
          ...c,
          date: [...c.date, `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`]
        }
      }
      return c;
    }) || [];
    const newRecords = records.map(record => {
      if (record.category === category) {
        return {
          ...record,
          content: rec
        }
      }
      return record;
    });

    const { error } = await supabase.from("records").update({
      content: rec
    }).eq("category", category);

    if (error) {
      causeError("Failed to add date: " + (error instanceof Error ? error.message : String(error)));
      console.log("Error adding date:", error);
      return;
    }

    setSelectedCategory({
      category,
      content: rec
    });
    setRecords(newRecords);
  }

  useEffect(() => {
    if (!loaded) {
      getRecords();
      supabase.auth.getUser().then(({ data }) => {
        setUser(data.user);
        setLoading(false);
        setLoaded(true);
      });

      const {
        data: { subscription }
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRecords([]);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  function dateCount(date: string) {
    const today = new Date();
    const [year, month, day] = date.split("/").map(Number);
    const dateObj = new Date(year, month - 1, day);
    const diffTime = Math.abs(today.getTime() - dateObj.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function daysAgo(date: string) {
    const d = dateCount(date);
    if (d === 0) {
      return "Today";
    } else if (d === 1) {
      return "Yesterday";
    } else {
      return `${d} days ago`;
    }
  }

  function taskPriority(content: Record) {
    const d = dateCount(content.date[content.date.length - 1]);
    switch (content.date.length) {
      case 1:
        if (d < 1) {
          return -100;
        }
        return d;
      case 2:
        if (d < 6 - 1) {
          return -100;
        }
        return d / 7;
      default:
        if (d < 24 - 7) {
          return -100;
        }
        return d / 30;
    }
  }

  function getTask() {
    const allContent: [Record, string][] = records.flatMap(record =>
      record.content.map(content => [content, record.category] as [Record, string])
    );
    const sortedContent = allContent.sort((a, b) => taskPriority(b[0]) - taskPriority(a[0]));
    return sortedContent.slice(0, 5);
  }

  return (
    <>
      <div className="error-container">
        {errors.map((error, index) => (
          <div key={index} className="error-message">
            {error.message}
          </div>
        ))}</div>
      {selectedCategory && (
        <div>
          <h2>{selectedCategory.category}</h2>
          <h3>Contents: {selectedCategory.content.length}</h3>
          {!addingContent && (<button onClick={() => setAddingContent(true)}>
            Add Content
          </button>)}
          {addingContent && (<>
            <label>
              Content Name:
              <input type='text' name="content" style={{ marginLeft: 10 }}
                ref={contentNameRef} />
            </label>
            <br />
            <label>
              Date:
              <input type='date' name="date" style={{ marginLeft: 10 }}
                ref={contentDateRef} defaultValue={new Date().toISOString().split('T')[0]} />
            </label>
            <br />
            <button onClick={() => {
              if (contentDateRef.current && contentNameRef.current) {
                addContent(selectedCategory.category, contentNameRef.current.value, contentDateRef.current.valueAsDate || new Date());
              }
            }} style={{ marginRight: 10 }}>
              Add
            </button>
            <button onClick={() => setAddingContent(false)}>
              Cancel
            </button>
          </>)}
          <br />
          {!addingDate && (<button onClick={() => setAddingDate(true)}>
            Add Date
          </button>)}
          {addingDate && (<>
            <label>
              Content:
              <select style={{ marginLeft: 10 }} ref={contentRef}>
                {selectedCategory.content.map((content, index) => (
                  <option key={index} value={content.content}>{content.content}</option>
                ))}
              </select>
            </label>
            <br />
            <label>
              Date:
              <input type='date' name="date" style={{ marginLeft: 10 }}
                ref={contentDateRef} defaultValue={new Date().toISOString().split('T')[0]} />
            </label>
            <br />
            <button onClick={() => {
              if (contentDateRef.current && contentRef.current) {
                addDate(selectedCategory.category, contentRef.current.value, contentDateRef.current.valueAsDate || new Date());
              }
            }} style={{ marginRight: 10 }}>
              Add
            </button>
            <button onClick={() => setAddingDate(false)}>
              Cancel
            </button>
          </>)}
          <br />
          {selectedCategory.content.map((content, index) => (
            <div key={index}>
              <p>{content.content}</p>
              <p>Dates: {content.date.join(", ")}</p>
            </div>
          ))}
          <button onClick={() => setSelectedCategory(null)}>
            Back to Categories
          </button>
        </div>
      )}
      {!selectedCategory && (<>
        {user ? (<>
          <p>Signing in as {user.email}</p>
          <button onClick={signOut}>
            Sign Out
          </button></>
        ) : (
          <button onClick={() => {
            supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: `${window.location.origin}/retention/auth/callback`
              }
            });
          }}>
            Log in
          </button>)}
        <h2>Tasks</h2>
        {getTask().map((content, index) => (
          <div key={index}>
            <p>
              <b>{index + 1}. </b>
              {content[0].content}
              <small style={{ marginLeft: 10 }}>in {content[1]}</small>
            </p>
            <p>Created at: {
              daysAgo(content[0].date[0])
            }</p>
          </div>
        ))}
        <h2>Categories</h2>
        {records.map((recordData, index) => (
          <div key={index}>
            <h3 style={{ marginBottom: 0, cursor: 'pointer' }}
              onClick={() => setSelectedCategory(recordData)}>
              {recordData.category}
            </h3>
            Contents: {recordData.content.length}
          </div>
        ))}
        <button onClick={() => setAddingCategory(true)}>
          Add Category
        </button>
        {addingCategory && (<>
          <label>
            New Category Name:
            <input type='text' name="categoryName" style={{ marginLeft: 10 }}
              ref={categoryNameRef} />
            <br />
            <button onClick={() => {
              if (categoryNameRef.current) {
                const newCategoryName = categoryNameRef.current.value;
                addCategory(newCategoryName);
                setAddingCategory(false);
              }
            }}>Add</button>
            <button onClick={() => setAddingCategory(false)} style={{ marginLeft: 10 }}>
              Cancel
            </button>
          </label>
        </>)}</>)}
    </>
  )
}

export default App
