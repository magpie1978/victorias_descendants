/*
 * Move all cards at or beyond a particular horizontal
 * position to the right.
 *
 * This is useful when making room for a new person.
 */
async function shiftCardsRightFromX(startX, distance) {
  if (!editMode || !currentEditor) {
    throw new Error('You must be logged in as an editor.');
  }

  const affectedNodes = Object.values(state.nodes)
    .filter(node => Number(node.x) >= Number(startX));

  if (affectedNodes.length === 0) {
    throw new Error('No cards were found in the selected area.');
  }

  /*
   * Keep the original positions in case the database save fails.
   */
  const originalPositions = affectedNodes.map(node => ({
    id: node.id,
    x: node.x,
    y: node.y
  }));

  /*
   * Move the cards immediately on screen.
   */
  affectedNodes.forEach(node => {
    node.x = Math.round(Number(node.x) + Number(distance));
    renderNode(node);
  });

  updateWorldSize();
  updateAllEdges();

  try {
    /*
     * Save every changed position.
     *
     * The upsert payload contains only the fields that
     * identify the position record and its coordinates.
     */
    const positionUpdates = affectedNodes.map(node => ({
      id: node.id,
      x: Math.round(node.x),
      y: Math.round(node.y)
    }));

    const { error } = await supabase
      .from('qvd_tree_positions')
      .upsert(positionUpdates, {
        onConflict: 'id'
      });

    if (error) {
      throw error;
    }

    console.log(
      `Moved ${affectedNodes.length} cards right by ${distance}px.`
    );
  } catch (error) {
    /*
     * Restore the original positions if saving fails.
     */
    originalPositions.forEach(original => {
      const node = state.nodes[original.id];

      if (!node) return;

      node.x = original.x;
      node.y = original.y;

      renderNode(node);
    });

    updateWorldSize();
    updateAllEdges();

    throw error;
  }
}







/*
 * Make room immediately to the left of a person.
 */
async function makeSpaceToLeftOfPerson(personId) {
  const person = state.nodes[personId];

  if (!person) {
    throw new Error(`Person ${personId} was not found.`);
  }

  const INSERT_GAP = 50;
  const distance = CARD_W + INSERT_GAP;

  /*
   * Peter and every card positioned to his right are moved.
   */
  await shiftCardsRightFromX(person.x, distance);
}







