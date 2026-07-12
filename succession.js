  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const SUPABASE_URL = 'https://eukgodthgusongsbhdwg.supabase.co';
  const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1a2dvZHRoZ3Vzb25nc2JoZHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NjI1NjAsImV4cCI6MjA2NzEzODU2MH0.e8Gm9utDCQWDjSOJgh-VBioCQFX_aAWXz8rzigFgh4s';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const tbody = document.getElementById('succession-body');
  const theadRow = document.getElementById('thead-row');
  const toggleSwitch = document.getElementById('toggleSwitch');
  const toggleLabel = document.getElementById('toggleLabel');
  const prevPageBtn = document.getElementById('prevPageBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');

  const FALLBACK_IMAGE = "https://i.pinimg.com/736x/3f/3c/f8/3f3cf824ceb39fa5dbd00aa986e25f54.jpg";
  
  // A helper function that ensures empty (null or blank) values are displayed as an empty string rather than "null" or "undefined". This keeps the table tidy.
  const safe = v => (v == null || v === '') ? '' : String(v);

  //Retrieve and display no more than 100 people per page.
  const PAGE_SIZE = 100;
  let includeExcluded = false;
  let currentPage = 0;
  let loading = false;
  let lastPage = false;

  let openDetailsRow = null;
  let openPersonRow = null;

  //Builds the table header (#, Name, Relationship, DOB) dynamically and inserts it into the page.
  function renderHeader(){
    theadRow.innerHTML = `
      <th class="pos">#</th>
      <th></th>
      <th>Name</th>
      <th>Relationship</th>
      <th>DOB</th>
    `;
  }

  //Converts abbreviated exclusion codes (such as rc or illeg) into readable English explanations.
  function formatExclusion(flag){
    if(!flag) return '';
    const f = String(flag).toLowerCase();
    if (f.includes('rc')) return 'Excluded for being a Roman Catholic';
    if (f.includes('illeg')) return 'Illegitimate';
    if (f.includes('duplicate')) return 'Duplicate';
    return flag;
  }

  //Takes one person's record from the database and converts it into a clickable HTML table row, including their name, titles, relationship, date of birth and (optionally) exclusion reason. 
  //It also stores the person's image and biography so they can be displayed later.
  function makeRow(row){
    const { name, title1, title2, dob, img, exclusion_flag, relationship_to_charles, biography } = row;
    const imgSrc = img || FALLBACK_IMAGE;
    const exclusionText = includeExcluded ? formatExclusion(exclusion_flag) : '';

    const tr = document.createElement('tr');
    tr.classList.add('person-row');
    tr.dataset.name = safe(name);
    tr.dataset.img = imgSrc;
    tr.dataset.bio = safe(biography);

    tr.innerHTML = `
      <td class="pos">${safe(row.order_excl)}</td>
      <td></td>
      <td>
        <div class="name">${safe(name)}</div>
        <div class="titles-stack">${safe(title1)}</div>
        <div class="titles-stack">${safe(title2)}</div>
        ${exclusionText ? `<div class="exclusion-text">${exclusionText}</div>` : ''}
      </td>
      <td><div class="relationship-text">${safe(relationship_to_charles)} of King Charles III</div></td>
      <td class="muted">${safe(dob)}</td>
    `;
    return tr;
  }

  //Efficiently adds multiple people to the table by creating all the rows first and then inserting them into the page in one operation. This improves performance.
  function appendRows(rows){
    const frag = document.createDocumentFragment();
    rows.forEach(r => frag.appendChild(makeRow(r)));
    tbody.appendChild(frag);
  }

  //The main database function. Retrieves one page (100 records) from Supabase, applies the current filter (hide/show excluded people), 
  //sorts the results, clears the previous page, inserts the new rows, and updates the Previous/Next buttons.
  async function fetchPage(pageIndex = 0){
    if (loading) return;
    loading = true;
    lastPage = false;
    tbody.innerHTML = '';
    openDetailsRow = null;
    openPersonRow = null;

    try {
      const from = pageIndex * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      let query = supabase
        .from('qvd_website')
        .select('order_excl,order_incl,name,title1,title2,dob,img,exclusion_flag,relationship_to_charles,biography');

      if (!includeExcluded){
        query = query.gt('order_excl', 0).order('order_excl', { ascending: true });
      } else {
        query = query.or('order_incl.gt.0,exclusion_flag.not.is.null').order('order_incl', { ascending: true });
      }

      query = query.range(from, to);

      const { data, error } = await query;
      if (error){ console.error(error); return; }

      const rows = data || [];
      appendRows(rows);

      currentPage = pageIndex;
      lastPage = rows.length < PAGE_SIZE;

      prevPageBtn.style.display = (currentPage === 0) ? 'none' : 'inline-block';
      prevPageBtn.disabled = currentPage === 0;
      nextPageBtn.disabled = lastPage;
    } catch (e){
      console.error(e);
    } finally {
      loading = false;
    }
  }

  //Closes the currently open biography panel beneath a person. Waits for the closing animation to finish before removing the panel from the page.
  function closeDetails(){
    if (!openDetailsRow) return;

    const rowToRemove = openDetailsRow;
    rowToRemove.classList.remove('open');
    openDetailsRow = null;
    openPersonRow = null;

    const panel = rowToRemove.querySelector('.details-panel');
    if (!panel){
      rowToRemove.remove();
      return;
    }

    const onEnd = e => {
      if (e.propertyName === 'max-height'){
        rowToRemove.removeEventListener('transitionend', onEnd);
        rowToRemove.remove();
      }
    };
    rowToRemove.addEventListener('transitionend', onEnd);
  }

  //Opens a biography panel underneath the selected person. Displays their photograph, name and biography. 
  //If another biography is already open, it closes that first. Clicking the same person twice toggles the panel closed.
  function openDetailsForRow(personRow){
    const name = personRow.dataset.name || 'Unknown';
    const imgSrc = personRow.dataset.img || FALLBACK_IMAGE;
    const bio = personRow.dataset.bio || 'No biography available.';

    if (openPersonRow === personRow){
      closeDetails();
      return;
    }

    if (openDetailsRow){
      closeDetails();
    }

    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('details-row');
    detailsRow.innerHTML = `
      <td colspan="5">
        <div class="details-panel">
          <div class="details-inner">
            <div class="details-photo-wrap">
              <img class="details-photo" alt="${safe(name)}" src="${imgSrc}" onerror="this.src='${FALLBACK_IMAGE}'" />
            </div>
            <div class="details-content">
              <div class="details-heading">${safe(name)}</div>
              <div class="details-text">${safe(bio)}</div>
            </div>
          </div>
        </div>
      </td>
    `;

    personRow.parentNode.insertBefore(detailsRow, personRow.nextSibling);

    requestAnimationFrame(() => {
      detailsRow.classList.add('open');
    });

    openDetailsRow = detailsRow;
    openPersonRow = personRow;
  }

  tbody.addEventListener('click', e => {
    const personRow = e.target.closest('tr.person-row');
    if (!personRow) return;
    e.stopPropagation();
    openDetailsForRow(personRow);
  });

  document.addEventListener('click', e => {
    if (!openDetailsRow) return;
    const clickedInDetails = e.target.closest('tr.details-row');
    const clickedPersonRow = e.target.closest('tr.person-row');
    if (clickedInDetails || clickedPersonRow) return;
    closeDetails();
  });

  toggleSwitch.addEventListener('change', () => {
    includeExcluded = toggleSwitch.checked;
    toggleLabel.textContent = includeExcluded ? 'Excluded People Displayed' : 'Excluded People Hidden';
    currentPage = 0;
    fetchPage(0);
  });

  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 0 && !loading){
      fetchPage(currentPage - 1);
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (!lastPage && !loading){
      fetchPage(currentPage + 1);
    }
  });

  toggleSwitch.checked = false;
  toggleLabel.textContent = 'Excluded People Hidden';
  renderHeader();
  fetchPage(0);
